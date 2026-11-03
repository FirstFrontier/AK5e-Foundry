# Progress: Medic Class, Physician, and Triage Implementation & Verification

- [x] Initial codebase audit, review handoffs analysis (`reviewer_medic_1`, `reviewer_medic_2`, `challenger_medic_2`), and test failure reproduction.
- [ ] R1: Fix `ak5e/scripts/medic-progression.mjs` and `ak5e/scripts/medic-rules.mjs` (ASI levels, idempotency, choice schema validation, Medical Kit ID, incremental HP).
- [ ] R2: Fix `ak5e/scripts/medic-uses.mjs` and `ak5e/scripts/medic-features.mjs` (Focused Treatment, Intravenous Line tuning + save, Hypocritic Oath heal-to-harm, Inpatient Care delayed reverberation on turnStart, Surgeon-General 1:2 heal doubling, On the Scene target capping, Urgent Care Centre cantrip rejection, Stop the Flow Mettle exact undo).
- [ ] R3: Fix `ak5e/scripts/medic-uses.mjs` and `ak5e/scripts/medic-sheet.mjs` (`validateTarget` for automatic GM relay, `receipt.formula` for interactive card roll buttons, `.ak5e-medic-badge` injection in Features tab).
- [ ] R4: Verification:
  - `node ak5e/tools/stress-medic-progression.mjs` (10/10 PASS)
  - `npm run test:medic` (100% PASS)
  - `npm run test:base-classes` (100% PASS)
  - `node ak5e/tools/validate-files.mjs` & `node ak5e/tools/verify-generated-content.mjs`
  - In-Foundry headless Playwright test (`ak5e/tools/test-medic-live.mjs`) & visual inspection.
