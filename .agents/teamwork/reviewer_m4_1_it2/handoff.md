# Handoff Report — Milestone 4 Iteration 2: Specialist Base Class Review

**Agent:** `reviewer_m4_1_it2`  
**Milestone:** Milestone 4 Iteration 2 (Specialist Base Character Class Remediation)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1_it2/`  
**Verdict:** **APPROVE**

---

## Review Summary

**Verdict**: **APPROVE**

Milestone 4 Iteration 2 (Specialist Base Character Class) has successfully remediated all four defects identified during Iteration 1. The codebase was independently inspected, verified through automated suites, and subjected to adversarial stress testing.

Zero integrity violations were identified: there are no hardcoded test shortcuts, no facade implementations, no bypassed mechanics, no fabricated logs, and no skipped or dummy test blocks.

### Findings Summary
- Defect 1 (Reaction Warning in `specialist-uses.mjs`): **RESOLVED**
- Defect 2 (Double Rest Recovery in `specialist-features.mjs`): **RESOLVED**
- Defect 3 (Fighting Style Category Cross-Validation in `specialist-progression.mjs`): **RESOLVED**
- Defect 4 (Adversarial Test Assertions in `specialist-adversarial.test.mjs`): **RESOLVED**

---

## 1. Observation

### 1.1 Remediation Code Verification

1. **Reaction Availability Check in `ak5e/scripts/specialist-uses.mjs`**:
   - Lines 169–172 (`itsAllSkill`):
     ```javascript
     const reactions = getReactions(actor);
     if (!reactions?.available) {
       warn(warnings, "reaction", "Reaction already expended this round.");
     }
     ```
   - Lines 237–240 (`defensiveStyle`):
     ```javascript
     const reactions = getReactions(actor);
     if (!reactions?.available) {
       warn(warnings, "reaction", "Reaction already expended this round.");
     }
     ```
   - Observed behavior: `getReactions(actor)` from `ak5e/scripts/trigger-events.mjs:482–486` returns `{ max, spent, extra, triggers, receipts, available }`. When `available === 0`, `!reactions?.available` evaluates to `true`, correctly emitting `{ id: "reaction", text: "Reaction already expended this round." }`. When `available >= 1`, it evaluates to `false`, emitting no warning.

2. **Single Hook Rest Recovery in `ak5e/scripts/specialist-features.mjs`**:
   - Lines 76–81:
     ```javascript
     export function registerSpecialistHooks() {
       if (hooksInstalled === globalThis.Hooks) return;
       hooksInstalled = globalThis.Hooks;
       defineSpecialistPools();
       registerResourcePoolHooks();
     }
     ```
   - Observed behavior: The redundant `globalThis.Hooks.on("dnd5e.restCompleted")` listener was completely removed. `registerResourcePoolHooks()` delegates canonically to `ak5e/scripts/resource-pools.mjs:462`, which registers `dnd5e.restCompleted` once with idempotent guarding (`registeredOn === globalThis.Hooks`). `prowess` defines `recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]`.

3. **Fighting Style Category Validation in `ak5e/scripts/specialist-progression.mjs`**:
   - Lines 443–452:
     ```javascript
     const weaponCat = choices.weaponCategory;
     if (!weaponCat || !["melee", "ranged"].includes(weaponCat)) {
       pending.push("weaponCategory");
     }
     const style = choices.fightingStyle;
     const categoryStyles = weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : (weaponCat === "melee" ? MELEE_FIGHTING_STYLES : []);
     const styleObj = categoryStyles.find(s => s.id === style);
     if (!style || !styleObj) {
       pending.push("fightingStyle");
     }
     ```
   - Observed behavior: `choices.fightingStyle` is now filtered strictly against `categoryStyles`. A Melee specialist selecting a Ranged style (or vice versa) results in `styleObj === undefined` and pushes `"fightingStyle"` into `pending`, marking `plan.valid = false`.

4. **Test Suite Reconciliations in `ak5e/test/specialist-adversarial.test.mjs`**:
   - `ADV-PROW-3B` tests single-hook rest recovery (`triggerShortRest(actor)` recovers exactly 1 Prowess).
   - `ADV-FU-4` tests that `itsAllSkill` emits `reaction` warning when reaction is spent (`available === 0`), and confirms that override with `{ overrides: ["reaction"] }` succeeds.
   - `ADV-WEAP-5A` tests that `defensiveStyle` emits `reaction` warning when reaction is spent.
   - `ADV-WEAP-5B` tests reaction consumption and clean reversible undo.
   - `ADV-UNDO-1` asserts `receipt.status === "complete"`.
   - `ADV-UNDO-2` asserts `getReactions(actor).available`.
   - `ADV-PROG-STYLE` tests category cross-validation for `previewSpecialistProgression`.
   - Zero tests are skipped or marked `todo`.

### 1.2 Verification Commands Executed & Verbatim Results

1. **`npm run test:specialist`**:
   ```text
   > test:specialist
   > node --test ak5e/test/specialist-*.test.mjs

   ✔ ADV-PROW-1: Prowess pool max scales strictly with Proficiency Bonus across levels 1–20 (8.831277ms)
   ✔ ADV-PROW-2: Initial Prowess value is 0, requiring rest or refund before use (0.57159ms)
   ✔ ADV-PROW-3A: Short Rest restores 1 Prowess and Long Rest restores 1 Prowess (bounded at max) (2.298573ms)
   ✔ ADV-PROW-3B: Rest via dnd5e.restCompleted hook recovers exactly 1 Prowess (no duplicate hook) (1.109886ms)
   ✔ ADV-PROW-4: Pre-level 4 actors do not gain Prowess on rests (0.471549ms)
   ✔ ADV-PROW-5: Zero-floor clamping on overspend and shortfall warnings with overrides (2.441715ms)
   ✔ ADV-MOS-1: Spend 1 Prowess on proficient ability check reroll (1.0329ms)
   ✔ ADV-MOS-2: Refund of 1 Prowess if second roll is also a failure (1.2905ms)
   ✔ ADV-MOS-3: Successful second roll results in no refund (Prowess remains spent) (0.918441ms)
   ✔ ADV-MOS-4: Level requirement check (Level < 4 triggers level warning) (0.571911ms)
   ✔ ADV-FU-1: Spend 3 Prowess and 1 reaction to auto-succeed on saving throw (1.61536ms)
   ✔ ADV-FU-2: Level < 17 triggers level warning (0.490906ms)
   ✔ ADV-FU-3: Shortfall behavior when Prowess < 3 (warns and clamps at 0 if overridden) (1.478028ms)
   ✔ ADV-FU-4: Reaction already spent triggers reaction warning for itsAllSkill (0.572531ms)
   ✔ ADV-WEAP-1: Level unlock gates for all weapon progression tiers (0.54009ms)
   ✔ ADV-WEAP-2: Weapon Expertise Melee vs Ranged choice enforcement and bonus (2.494205ms)
   ✔ ADV-WEAP-3: Weapon Mastery Melee bonus scales to floor(level / 2) (0.990638ms)
   ✔ ADV-WEAP-4: Weapon Mastery Ranged bonus doubles PB (+PB attack bonus) (0.90728ms)
   ✔ ADV-WEAP-5A: Defensive Fighting Style emits reaction warning when reaction is spent (0.444237ms)
   ✔ ADV-WEAP-5B: Defensive Fighting Style reaction consumption and clean reversible undo (1.077835ms)
   ✔ ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo (0.552553ms)
   ✔ ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration (1.62593ms)
   ✔ ADV-UNDO-3: Undo with shortfall override correctly restores 'before' value, not theoretical cost (0.94891ms)
   ✔ ADV-PROG-STYLE: previewSpecialistProgression cross-validates fightingStyle against weaponCategory (7.892629ms)
   [... 24 unit and progression tests ...]
   ℹ tests 48
   ℹ suites 0
   ℹ pass 48
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 202.4432
   ```
   Exit code: 0.

2. **`node ak5e/tools/stress-specialist-progression.mjs`**:
   ```text
   Starting Adversarial Stress Harness for Specialist...
   [PASS] Setup Idempotency: 5 sequential runs do not duplicate items
   [PASS] Setup Idempotency: Pre-populated authored feature is preserved and not overwritten
   [PASS] Setup Idempotency: Custom weapons, armor, and abilities are preserved untouched
   [PASS] Setup Idempotency: Level 20 populates all 13 core features and is idempotent
   [PASS] Progression Invariant: Incremental level-up 1 -> 20 preserves exact HP math and gear rules
   [PASS] Progression Invariant: Re-run at level 20 does not double-count HP or ASIs
   [PASS] Progression Invariant: Starting equipment items mode grants items once and never duplicates
   [PASS] Progression Invariant: Negative CON mod enforces 1 HP minimum gain
   [PASS] Choice Validation: Permute invalid saving throws (Dex+Str, Wis+Cha, 2 saves, unlisted)
   [PASS] Choice Validation: Permute invalid skill counts (2 skills, 4 skills, unlisted Athletics, duplicates)
   [PASS] Choice Validation: Permute invalid rolled HP (0, 9, negative, float, NaN)
   [PASS] Choice Validation: Permute invalid ASIs (+3, +2/+1, +1/+1 same stat, 3 stats, 20 cap)
   [PASS] Choice Validation: ContextKey tampering and unconfirmed calls throw
   [PASS] Choice Validation: Weapon Specialisation category and style validation
   [PASS] Progression Invariant: Caller attempts to re-grant cash or gear at higher levels are blocked
   [PASS] Architecture Guards: Multiclass and invalid class level safety
   [PASS] Choice Validation: Deep ContextKey tampering permutations

   === SUMMARY OF ADVERSARIAL STRESS HARNESS ===
   Passed: 17/17, Failed: 0/17
   ```
   Exit code: 0.

3. **`node ak5e/tools/validate-files.mjs`**:
   ```text
   Validated module.json, lang/en.json, and 251 .mjs files.
   ```
   Exit code: 0.

4. **`npm run test:base-classes`**:
   - Vanguard: 74 pass, 0 fail
   - Supporter: 44 pass, 0 fail
   - Specialist: 48 pass, 0 fail
   - Medic: 0 tests (pending M5)
   Exit code: 0.

5. **`npm test`**:
   - All modules (content, parsers, rules, installers, origins, deployment, caster, defender, guard, marksman, base-classes) pass cleanly.
   Exit code: 0.

---

## 2. Logic Chain

1. **Table-Play Reaction Warning Invariant (WORKFLOW §3.2)**:
   - WORKFLOW §3.2 stipulates that active feature activations must warn when prerequisites are not met (such as reaction depletion) without blocking play, allowing player override with "Use anyway".
   - In `ak5e/scripts/specialist-uses.mjs:170,238`, replacing the non-existent property check `reactions.value < 1` with `!reactions?.available` aligns directly with the data structure returned by `getReactions(actor)`.
   - Independent verification confirms that when `available === 0`, `PlayWarnings` is thrown with `id: "reaction"`; providing `{ overrides: ["reaction"] }` succeeds and records the warning on the plan and chat receipt.
   - Independent verification also confirms that execution consumes the reaction (`available: 0`), and undo restores it (`available: 1`).
   - Therefore, Defect 1 is completely and correctly remediated.

2. **Rules Authority on Rest Recovery (AK5e Ch. 3 L5315)**:
   - Source rules state: "You gain 1 Prowess whenever you complete a Short or Long Rest."
   - Removing the duplicate listener in `specialist-features.mjs` and relying on the canonical `dnd5e.restCompleted` hook in `resource-pools.mjs` guarantees that exactly 1 Prowess is recovered per rest.
   - Independent testing of repeated rests under multi-hook conditions confirms: Short Rest 1 -> 1 Prowess, Short Rest 2 -> 2 Prowess, Long Rest -> 3 Prowess (clamped at max PB).
   - Therefore, Defect 2 is completely and correctly remediated.

3. **Fighting Style Category Integrity (AK5e Ch. 3 L5190–5200)**:
   - Chapter 3 separates fighting styles into distinct Melee and Ranged tables.
   - In `specialist-progression.mjs:448`, filtering through `categoryStyles` rejects cross-category selections during progression preview.
   - Independent testing of all 15 fighting styles confirmed: all 8 Melee styles succeed with Melee category; all 7 Ranged styles succeed with Ranged category; all 8 Melee styles fail with Ranged category; all 7 Ranged styles fail with Melee category; invalid category strings reject both category and style.
   - Therefore, Defect 3 is completely and correctly remediated.

4. **Adversarial Assertion Reconciliation**:
   - Reconciling the adversarial test suite from demonstrating defects to asserting intended contracts yields 100% test pass rates across all 24 adversarial tests.
   - Zero tests were skipped, marked `todo`, or weakened.
   - The entire repository test battery (`npm test`) passes with exit code 0.
   - Therefore, Defect 4 is completely and correctly remediated.

---

## 3. Adversarial Stress Test Results

| Attack Scenario | Target File | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Spent reaction (`available: 0`) on `itsAllSkill` | `specialist-uses.mjs:170` | Emits `reaction` warning, throws `PlayWarnings` without override | Warning emitted, throws `PlayWarnings` | **PASS** |
| Spent reaction (`available: 0`) on `defensiveStyle` | `specialist-uses.mjs:238` | Emits `reaction` warning, throws `PlayWarnings` without override | Warning emitted, throws `PlayWarnings` | **PASS** |
| Override reaction warning with `{ overrides: ["reaction"] }` | `specialist-uses.mjs` | Execution proceeds, warning preserved in plan | Plan succeeds with warning present | **PASS** |
| Multi-action reaction consumption & undo | `specialist-uses.mjs` | Reaction consumed on execute, restored on undo | Consumes 1 -> 0, restores 0 -> 1 | **PASS** |
| Dual hook registration on Short/Long Rest | `specialist-features.mjs` | Exactly 1 Prowess restored per rest, bounded at PB cap | Exactly +1 Prowess per rest | **PASS** |
| All 8 Melee styles with Melee category | `specialist-progression.mjs` | All 8 pass preview (`valid: true`) | All 8 pass | **PASS** |
| All 7 Ranged styles with Ranged category | `specialist-progression.mjs` | All 7 pass preview (`valid: true`) | All 7 pass | **PASS** |
| Cross-category mismatch (8 Melee styles with Ranged category) | `specialist-progression.mjs` | All 8 rejected (`pending: ["fightingStyle"]`) | All 8 rejected | **PASS** |
| Cross-category mismatch (7 Ranged styles with Melee category) | `specialist-progression.mjs` | All 7 rejected (`pending: ["fightingStyle"]`) | All 7 rejected | **PASS** |
| Invalid `weaponCategory: "arcane"` | `specialist-progression.mjs` | Both category and style marked pending | Both marked pending | **PASS** |
| Integrity: Check for hardcoded shortcuts or skips | `specialist-*.mjs`, `test/` | Zero hardcoded test outcomes, zero skipped tests | 0 violations found | **PASS** |

---

## 4. Caveats

- Subclass branches (Executor, Hookmaster, Infuser, Inventor, Skyranger, Dollkeeper, Trapmaster) are scheduled for dedicated subclass milestones per `PROJECT.md`; these reviews and tests apply to the base Specialist chassis.
- In-Foundry live browser rendering and screenshot validation on port 30175 are scheduled for Milestone 7 (planned).
- No other caveats.

---

## 5. Conclusion

All four defects from Milestone 4 Iteration 1 have been fully, genuinely, and robustly remediated.
The implementation strictly adheres to AK5e Chapter 3 rules and WORKFLOW §3.2 table-play requirements.
Integrity checks confirmed zero facade or shortcut implementations.
All verification commands (`npm run test:specialist`, `node ak5e/tools/validate-files.mjs`, `npm run test:base-classes`, `npm test`) pass cleanly with exit code 0.

**Final Verdict**: **APPROVE**

---

## 6. Verification Method

To independently reproduce and verify this assessment:

1. **Run Specialist Unit and Adversarial Test Suite**:
   ```bash
   npm run test:specialist
   ```
   *Expected outcome:* 48 tests pass, 0 fail, 0 todo, 0 skipped.

2. **Run Progression Stress Test Harness**:
   ```bash
   node ak5e/tools/stress-specialist-progression.mjs
   ```
   *Expected outcome:* 17/17 tests pass.

3. **Run Static File and Syntax Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome:* Validates 251 `.mjs` files with 0 errors.

4. **Run Base Classes Regression Suite**:
   ```bash
   npm run test:base-classes
   ```
   *Expected outcome:* Vanguard (74 pass), Supporter (44 pass), Specialist (48 pass) exit code 0.

5. **Run Full Repository Regression Suite**:
   ```bash
   npm test
   ```
   *Expected outcome:* Clean exit code 0 across all repository test suites.
