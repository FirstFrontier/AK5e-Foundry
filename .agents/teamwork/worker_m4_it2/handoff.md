# Handoff Report — Milestone 4 Iteration 2: Specialist Base Class Remediation

**Agent:** `worker_m4_it2`  
**Milestone:** Milestone 4 Iteration 2 (Specialist Base Character Class Remediation)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m4_it2/`  

---

## 1. Observation

### 1.1 Baseline State and Initial Defects
1. **`ak5e/scripts/specialist-uses.mjs` (Lines 170 and 238)**:
   - Initial code evaluated:
     ```javascript
     const reactions = getReactions(actor);
     if (reactions.value < 1) {
       warn(warnings, "reaction", "Reaction already expended this round.");
     }
     ```
   - In `ak5e/scripts/trigger-events.mjs:482–486`, `getReactions(actor)` returns an object `{ max, spent, extra, triggers, receipts, available }` lacking a `.value` property. Consequently, `reactions.value` was `undefined`, and `undefined < 1` evaluated to `false`. When an actor had expended their reaction (`available === 0`), no non-blocking reaction warning was emitted on `itsAllSkill` or `defensiveStyle`.
   - Running `npm run test:specialist` prior to modification produced:
     ```text
     ⚠ ADV-FU-4B: [TODO CONTRACT] itsAllSkill should emit reaction warning when reaction is spent # Defect in specialist-uses.mjs:170 — checks reactions.value instead of reactions.available
       AssertionError [ERR_ASSERTION]: Missing expected exception.
     ```

2. **`ak5e/scripts/specialist-features.mjs` (Lines 81–86)**:
   - Initial code in `registerSpecialistHooks()` attached an extra `dnd5e.restCompleted` hook:
     ```javascript
     if (typeof globalThis.Hooks?.on === "function") {
       globalThis.Hooks.on("dnd5e.restCompleted", async (actor, result, config = {}) => {
         const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
         await onSpecialistRest(actor, type);
       });
     }
     ```
   - At the same time, `ak5e/scripts/resource-pools.mjs:462` attaches `Hooks.on("dnd5e.restCompleted", onRestCompleted)`, which automatically invokes `recoverPool(actor, triggers)` for all pools with recovery rules. Because `prowess` defines `recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]`, rests recovered +2 Prowess instead of +1 in live multi-hook play.

3. **`ak5e/scripts/specialist-progression.mjs` (Lines 447–451)**:
   - Initial code validated fighting styles against the global array `ALL_FIGHTING_STYLES`:
     ```javascript
     const style = choices.fightingStyle;
     const styleObj = ALL_FIGHTING_STYLES.find(s => s.id === style);
     if (!style || !styleObj) {
       pending.push("fightingStyle");
     }
     ```
   - This permitted selecting a Ranged style (e.g., `ranger`) when `weaponCategory` was `"melee"`, or a Melee style (e.g., `duelling`) when `weaponCategory` was `"ranged"`.

4. **`ak5e/test/specialist-adversarial.test.mjs`**:
   - `ADV-PROW-3B` manually invoked `onSpecialistRest` twice to demonstrate the defect.
   - `ADV-FU-4A` and `ADV-WEAP-5A` asserted `hasReactionWarning === false` as empirical defect demonstrations.
   - `ADV-FU-4B` was marked `{ todo: ... }` and failed with an `AssertionError`.
   - Cross-category fighting style validation was not tested in the adversarial suite.

### 1.2 Implemented Changes
1. **`ak5e/scripts/specialist-uses.mjs`**:
   - Replaced `reactions.value < 1` with `!reactions?.available` at line 170 (`itsAllSkill`) and line 238 (`defensiveStyle`).
2. **`ak5e/scripts/specialist-features.mjs`**:
   - Imported `registerResourcePoolHooks` from `./resource-pools.mjs`.
   - Removed lines 81–86 (redundant `Hooks.on("dnd5e.restCompleted")`).
   - Updated `registerSpecialistHooks()` to delegate to idempotent `registerResourcePoolHooks()`, guarded by `if (hooksInstalled === globalThis.Hooks) return;`.
3. **`ak5e/scripts/specialist-progression.mjs`**:
   - Removed unused import `ALL_FIGHTING_STYLES`.
   - Updated lines 447–451 to filter fighting styles against `const categoryStyles = weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : (weaponCat === "melee" ? MELEE_FIGHTING_STYLES : []);`.
4. **`ak5e/test/specialist-adversarial.test.mjs`**:
   - Reconciled `ADV-PROW-3B` to test that rest hooks trigger exactly 1 Prowess recovery without duplication.
   - Replaced `ADV-FU-4A` and `ADV-FU-4B` with consolidated `ADV-FU-4` testing `PlayWarnings` exception with `id: "reaction"` and successful override recording.
   - Replaced `ADV-WEAP-5A` with a test verifying reaction warning emission on `defensiveStyle`.
   - Appended `ADV-PROG-STYLE` testing category cross-validation for `previewSpecialistProgression`.

---

## 2. Logic Chain

1. **Table-Play Agency and Warning Invariants (WORKFLOW §3.2)**:
   - WORKFLOW §3.2 stipulates that active features require confirmation, warn on unfulfilled prerequisites (such as exhausted reactions), and allow non-blocking overrides.
   - Testing `!reactions?.available` accurately reflects `getReactions(actor)` returning `{ available: 0 }` when spent.
   - Both `itsAllSkill` and `defensiveStyle` now correctly push `{ id: "reaction", ... }` into `warnings`, throwing `PlayWarnings` when un-overridden and allowing table execution when overridden with `{ overrides: ["reaction"] }`.
   - This directly resolves Defect 1.

2. **Single Hook Rest Recovery (AK5e Ch. 3 L5315)**:
   - Chapter 3 L5315 specifies gaining exactly 1 Prowess on a Short or Long Rest.
   - Removing the manual `dnd5e.restCompleted` listener in `specialist-features.mjs` leaves `resource-pools.mjs:registerResourcePoolHooks()` as the single authoritative rest listener.
   - Delegating to `registerResourcePoolHooks()` inside `registerSpecialistHooks()` ensures that tests running `registerSpecialistHooks()` in isolation attach the canonical hook, while live module execution via `ak5e.mjs:372` remains completely idempotent.
   - This directly resolves Defect 2.

3. **Fighting Style Category Integrity (AK5e Ch. 3 L5190–5200)**:
   - Melee and Ranged fighting styles are distinct tables.
   - Checking `categoryStyles.find(s => s.id === style)` prevents mismatched combinations during `previewSpecialistProgression`, adding `"fightingStyle"` to `plan.pending` when mismatched.
   - This directly resolves Defect 3.

4. **Adversarial Suite Validation and Gate Clearance**:
   - Reconciling the adversarial test cases from defect demonstrations into assertions of expected behavior allows all 48 tests in `npm run test:specialist` to pass cleanly.
   - Running the full verification battery confirms zero regressions across all base classes and module systems.
   - This directly resolves Defect 4.

---

## 3. Caveats

- Subclass implementations (Executor, Hookmaster, Infuser, etc.) remain scheduled for dedicated subclass milestones per `PROJECT.md`; these remediations apply strictly to the base Specialist class chassis.
- No other caveats.

---

## 4. Conclusion

All four defects identified in Iteration 1 review have been fully and genuinely remediated:
1. `ak5e/scripts/specialist-uses.mjs`: `!reactions?.available` restores reaction warnings on `itsAllSkill` and `defensiveStyle`.
2. `ak5e/scripts/specialist-features.mjs`: Redundant rest hook removed, single canonical hook restores exactly 1 Prowess per rest.
3. `ak5e/scripts/specialist-progression.mjs`: `categoryStyles` filters fighting styles by weapon category.
4. `ak5e/test/specialist-adversarial.test.mjs`: Reconciled test assertions confirm 100% test pass rate with 0 failures, 0 skipped, and 0 todo.

---

## 5. Verification Method

To independently verify all changes, run the following commands:

1. **Verify Specialist Test Suite**:
   ```bash
   npm run test:specialist
   ```
   *Verified Result:* 48 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo.

2. **Verify Progression Adversarial Stress Harness**:
   ```bash
   node ak5e/tools/stress-specialist-progression.mjs
   ```
   *Verified Result:* 17/17 checks passed, 0 failed.

3. **Validate Syntax, Schema, and Structure**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Verified Result:* Validated module.json, lang/en.json, and 251 .mjs files with 0 errors.

4. **Verify All Base Classes Tests**:
   ```bash
   npm run test:base-classes
   ```
   *Verified Result:* All Vanguard, Supporter, and Specialist suites exit code 0.

5. **Verify Full Repository Regression Suite**:
   ```bash
   npm test
   ```
   *Verified Result:* Clean run across all unit, integration, and rules suites with exit code 0.
