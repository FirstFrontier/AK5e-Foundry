# Handoff Report — Milestone 4 Iteration 2: Specialist Base Class Independent Review

**Agent:** `reviewer_m4_2_it2`  
**Milestone:** Milestone 4 Iteration 2 (Specialist Base Character Class Remediation)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2_it2/`  
**Verdict:** **APPROVE**  

---

## Review Summary

**Verdict**: **APPROVE**

Milestone 4 Iteration 2 (Specialist Base Character Class) has undergone an independent, high-reliability adversarial review and verification. All four defects identified in Iteration 1 have been completely, accurately, and cleanly remediated with zero regressions:

1. **Reaction Availability Check (`specialist-uses.mjs`)**: Both `itsAllSkill` (line 170) and `defensiveStyle` (line 238) now correctly inspect `!reactions?.available`. Reaction exhaustion correctly triggers non-blocking warning `{ id: "reaction", text: "Reaction already expended this round." }` and supports execution with `{ overrides: ["reaction"] }` per WORKFLOW §3.2.
2. **Rest Hook Recovery Idempotency (`specialist-features.mjs`)**: The redundant `dnd5e.restCompleted` hook has been removed; `registerSpecialistHooks()` idempotently delegates to `registerResourcePoolHooks()`, ensuring exactly 1 Prowess is recovered per Short or Long Rest (AK5e Ch. 3 L5315).
3. **Fighting Style Category Integrity (`specialist-progression.mjs`)**: `previewSpecialistProgression` (lines 448–452) validates fighting styles against the selected `weaponCategory` (`categoryStyles`), preventing cross-category selection while maintaining full flexibility for all 8 melee styles and 7 ranged styles.
4. **Regression & Adversarial Test Suites**: All 48 tests in `npm run test:specialist` pass (0 failed, 0 todo). The full repository regression suite `npm test` passes cleanly with exit code 0.
5. **Integrity Audit**: Clean. Zero hardcoded test values, zero dummy facades, zero bypassed tasks, and zero fabricated logs.

---

## 1. Observation

### 1.1 Verbatim Code Observations

1. **Reaction Property Check in `specialist-uses.mjs`**:
   - `ak5e/scripts/specialist-uses.mjs:169–173`:
     ```javascript
     169:     const reactions = getReactions(actor);
     170:     if (!reactions?.available) {
     171:       warn(warnings, "reaction", "Reaction already expended this round.");
     172:     }
     ```
   - `ak5e/scripts/specialist-uses.mjs:237–241`:
     ```javascript
     237:     const reactions = getReactions(actor);
     238:     if (!reactions?.available) {
     239:       warn(warnings, "reaction", "Reaction already expended this round.");
     240:     }
     ```
   - Matches sibling implementations in `supporter-uses.mjs:162` and `vanguard-uses.mjs:261`.

2. **Single Hook Rest Recovery in `specialist-features.mjs`**:
   - `ak5e/scripts/specialist-features.mjs:76–81`:
     ```javascript
     76: export function registerSpecialistHooks() {
     77:   if (hooksInstalled === globalThis.Hooks) return;
     78:   hooksInstalled = globalThis.Hooks;
     79:   defineSpecialistPools();
     80:   registerResourcePoolHooks();
     81: }
     ```
   - The duplicate `Hooks.on("dnd5e.restCompleted")` listener from Iteration 1 was removed. `registerResourcePoolHooks()` attaches the single canonical listener in `resource-pools.mjs:462`.

3. **Category Validation in `specialist-progression.mjs`**:
   - `ak5e/scripts/specialist-progression.mjs:447–452`:
     ```javascript
     447:   const style = choices.fightingStyle;
     448:   const categoryStyles = weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : (weaponCat === "melee" ? MELEE_FIGHTING_STYLES : []);
     449:   const styleObj = categoryStyles.find(s => s.id === style);
     450:   if (!style || !styleObj) {
     451:     pending.push("fightingStyle");
     452:   }
     ```
   - Validates that the chosen style belongs to the array corresponding to `weaponCategory`.

4. **Adversarial Test Assertions in `specialist-adversarial.test.mjs`**:
   - `ADV-FU-4` (lines 296–315): tests that `itsAllSkill` throws `PlayWarnings` when `getReactions(actor).available === 0` without override, and succeeds when overridden with `{ overrides: ["reaction"] }`.
   - `ADV-WEAP-5A` (lines 433–449): tests that `defensiveStyle` emits `reaction` warning when reaction is exhausted.
   - `ADV-WEAP-5B` (lines 451–467): tests reaction consumption and clean reversible undo for `defensiveStyle`.
   - `ADV-PROW-3B` (lines 116–126): tests single hook recovery (+1 Prowess) on `triggerShortRest(actor)`.
   - `ADV-PROG-STYLE` (lines 544–586): tests cross-category style rejection and valid selection.

### 1.2 Independent Empirical Verifications

1. **Reaction Workflow Execution**:
   - Executed dynamic evaluation:
     - With `available: 1`: `plan.warnings.some(w => w.id === "reaction") === false`.
     - After `spendReaction()` (`available: 0`): `plan(actor, "itsAllSkill")` throws `AK5eWarnings` with `[ { id: "reaction", text: "Reaction already expended this round." } ]`.
     - Executed with `{ overrides: ["reaction"] }`: receipt records `reaction.spent = false`.
     - Undo with `reaction.spent = false`: cleanly reverts without corrupting reaction counter.
   - Result: **PASS**

2. **Rest Hook Recovery Execution**:
   - Executed 10 sequential calls to `registerSpecialistHooks()` and `registerResourcePoolHooks()`.
   - Triggered Short Rest on a 6th-level Specialist with 0 Prowess:
     - After Short Rest #1: Prowess = 1 (exactly +1).
     - After Short Rest #2: Prowess = 2 (exactly +1).
     - After Long Rest #1: Prowess = 3 (reaches max 3).
     - After Long Rest #2 at max: Prowess = 3 (clamped at max).
   - Triggered Short/Long Rest on a 3rd-level Specialist (before Show Your Style at Lv 4):
     - Prowess = 0 (recovers 0).
   - Result: **PASS**

3. **Style Category Permutation Testing**:
   - Tested all 8 melee styles with `weaponCategory: "melee"`: 8/8 valid.
   - Tested all 8 melee styles with `weaponCategory: "ranged"`: 8/8 rejected (`pending.includes("fightingStyle")`).
   - Tested all 7 ranged styles with `weaponCategory: "ranged"`: 7/7 valid.
   - Tested all 7 ranged styles with `weaponCategory: "melee"`: 7/7 rejected (`pending.includes("fightingStyle")`).
   - Tested bogus styles and invalid categories: all rejected.
   - Result: **PASS**

4. **Suite Execution Results**:
   - `npm run test:specialist`: 48 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo (duration: 206ms).
   - `node ak5e/tools/validate-files.mjs`: Validated `module.json`, `lang/en.json`, and 251 `.mjs` files with 0 errors.
   - `npm run test:base-classes`: Vanguard (74 pass), Supporter (44 pass), Specialist (48 pass) exit code 0.
   - `node ak5e/tools/stress-specialist-progression.mjs`: 17/17 checks passed, 0 failed.
   - `npm test`: Full repository suite completed with exit code 0.

---

## 2. Logic Chain

1. **WORKFLOW §3.2 Table Play Invariant**:
   - WORKFLOW §3.2 stipulates that active features require confirmation, warn on unfulfilled prerequisites (such as exhausted reactions), and allow non-blocking overrides.
   - In `specialist-uses.mjs`, `getReactions(actor)` returns `{ available: Number, ... }`.
   - Checking `!reactions?.available` accurately catches when `available === 0` (or undefined).
   - Emitting `warn(warnings, "reaction", ...)` enables the client UI to present an override warning dialog, and allows execution with `{ overrides: ["reaction"] }`.
   - Empirically verified via node test and adversarial test suite `ADV-FU-4` and `ADV-WEAP-5A`.
   - Logic supports APPROVE.

2. **Rules Authority Adherence (Chapter 3 L5315)**:
   - Source rules state: "You gain 1 Prowess whenever you complete a Short or Long Rest."
   - In Iteration 1, dual listeners caused +2 Prowess per rest.
   - Removing the manual listener in `specialist-features.mjs` and delegating to `registerResourcePoolHooks()` ensures only one listener is active on `dnd5e.restCompleted`.
   - Because `registerResourcePoolHooks()` is guarded by `registeredOn === globalThis.Hooks`, repeated calls are idempotent.
   - Empirically verified to recover exactly 1 Prowess per rest up to `@prof`.
   - Logic supports APPROVE.

3. **Fighting Style Progression Integrity (Chapter 3 L5190–5200)**:
   - Melee Combat specialists must choose from `MELEE_FIGHTING_STYLES`; Ranged Combat specialists must choose from `RANGED_FIGHTING_STYLES`.
   - In `specialist-progression.mjs`, validating against `categoryStyles` rejects mismatched combinations during preview and prevents application via `need(plan.valid)`.
   - Empirically verified across all 15 fighting styles in both categories.
   - Logic supports APPROVE.

4. **Integrity & Code Quality**:
   - Zero hardcoded test outputs or mock shortcuts detected.
   - Real mathematical formulas, rules models, and idempotency guards are in place.
   - All tests pass with 0 skipped and 0 todo.
   - Logic supports APPROVE.

---

## 3. Caveats

- Subclass implementations (Executor, Hookmaster, Infuser, Inventor, Skyranger, Dollkeeper, Trapmaster) are scheduled for subsequent subclass milestones per `PROJECT.md`; this review certifies the complete Specialist base class chassis.
- Headless browser sheet inspection with screenshots is deferred to Milestone 7 per the milestone plan.
- No other caveats.

---

## 4. Conclusion

All defects from Iteration 1 have been completely, authentically, and robustly resolved. The Specialist base character class implementation fully satisfies AK5e Chapter 3 rules authority, WORKFLOW §3.2 table play philosophy, progression idempotency, and repository quality gates.

**Final Verdict:** **APPROVE**

---

## 5. Verification Method

To independently verify the implementation:

1. **Run Specialist Unit and Adversarial Test Suite**:
   ```bash
   npm run test:specialist
   ```
   *Pass criteria:* 48 tests pass, 0 fail, 0 todo.

2. **Run File and Schema Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Pass criteria:* 0 syntax or schema errors across all 251 `.mjs` files.

3. **Run Adversarial Progression Stress Harness**:
   ```bash
   node ak5e/tools/stress-specialist-progression.mjs
   ```
   *Pass criteria:* 17/17 checks pass.

4. **Run Base Classes Regression Battery**:
   ```bash
   npm run test:base-classes
   ```
   *Pass criteria:* Vanguard, Supporter, and Specialist test suites pass with exit code 0.

5. **Run Full Repository Regression Suite**:
   ```bash
   npm test
   ```
   *Pass criteria:* Exit code 0 across all repository test suites.
