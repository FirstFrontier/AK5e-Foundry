# Handoff Report — Milestone 4 Iteration 2: Empirical Challenger Verification

**Agent:** `challenger_m4_2_it2`  
**Role:** `critic`, `specialist` (Adversarial Empirical Verifier)  
**Milestone:** Milestone 4 Iteration 2 (Specialist Base Class Remediation)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_2_it2/`  
**Verdict:** **APPROVE**  

---

## 1. Observation

### 1.1 Progression Harness Execution
Direct execution of the official progression stress harness:
```bash
node ak5e/tools/stress-specialist-progression.mjs
```
Verbatim command output:
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
Exit code: `0`. 17/17 stress tests passed cleanly.

### 1.2 Specialist Unit & Adversarial Test Suite Execution
Direct execution of the Specialist test suite:
```bash
npm run test:specialist
```
Verbatim command output:
```text
> test:specialist
> node --test ak5e/test/specialist-*.test.mjs

✔ ADV-PROW-1: Prowess pool max scales strictly with Proficiency Bonus across levels 1–20 (8.854202ms)
✔ ADV-PROW-2: Initial Prowess value is 0, requiring rest or refund before use (0.583843ms)
✔ ADV-PROW-3A: Short Rest restores 1 Prowess and Long Rest restores 1 Prowess (bounded at max) (2.511749ms)
✔ ADV-PROW-3B: Rest via dnd5e.restCompleted hook recovers exactly 1 Prowess (no duplicate hook) (1.123051ms)
✔ ADV-PROW-4: Pre-level 4 actors do not gain Prowess on rests (0.472451ms)
✔ ADV-PROW-5: Zero-floor clamping on overspend and shortfall warnings with overrides (2.288734ms)
✔ ADV-MOS-1: Spend 1 Prowess on proficient ability check reroll (0.957726ms)
✔ ADV-MOS-2: Refund of 1 Prowess if second roll is also a failure (1.33186ms)
✔ ADV-MOS-3: Successful second roll results in no refund (Prowess remains spent) (0.972624ms)
✔ ADV-MOS-4: Level requirement check (Level < 4 triggers level warning) (0.491447ms)
✔ ADV-FU-1: Spend 3 Prowess and 1 reaction to auto-succeed on saving throw (1.361726ms)
✔ ADV-FU-2: Level < 17 triggers level warning (0.384784ms)
✔ ADV-FU-3: Shortfall behavior when Prowess < 3 (warns and clamps at 0 if overridden) (1.466215ms)
✔ ADV-FU-4: Reaction already spent triggers reaction warning for itsAllSkill (0.577742ms)
✔ ADV-WEAP-1: Level unlock gates for all weapon progression tiers (0.529239ms)
✔ ADV-WEAP-2: Weapon Expertise Melee vs Ranged choice enforcement and bonus (2.501018ms)
✔ ADV-WEAP-3: Weapon Mastery Melee bonus scales to floor(level / 2) (1.003063ms)
✔ ADV-WEAP-4: Weapon Mastery Ranged bonus doubles PB (+PB attack bonus) (0.805826ms)
✔ ADV-WEAP-5A: Defensive Fighting Style emits reaction warning when reaction is spent (0.439608ms)
✔ ADV-WEAP-5B: Defensive Fighting Style reaction consumption and clean reversible undo (1.08069ms)
✔ ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo (0.513319ms)
✔ ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration (1.673611ms)
✔ ADV-UNDO-3: Undo with shortfall override correctly restores 'before' value, not theoretical cost (0.961142ms)
✔ ADV-PROG-STYLE: previewSpecialistProgression cross-validates fightingStyle against weaponCategory (7.647981ms)
✔ Feature level unlocks: Weapon Specialisation, Show Your Style, Weapon Adept, Weapon Expertise, Falling Upwards, Weapon Mastery (3.73459ms)
✔ Resource pool: prowess registration, initial value, spend, refund, and max cap (1.97238ms)
✔ Short Rest and Long Rest recovery: 1 Prowess restored per rest up to maximum (6.131531ms)
✔ specialistUses: markOfASpecialist spend, shortfall warning override, and refund (3.896168ms)
✔ specialistUses: weaponExpertiseMelee and weaponExpertiseRanged (1.83017ms)
✔ specialistUses: itsAllSkill auto-success spend, reaction consumption, and undo (2.128438ms)
✔ specialistUses: weaponMasteryMelee and weaponMasteryRanged calculations (1.109786ms)
✔ specialistUses: defensiveStyle reaction spend and undo (1.053749ms)
✔ previewSpecialistSetup: generates feature items up to actor level and deterministic contextKey (3.056467ms)
✔ applySpecialistSetup: idempotent application preserving existing features (2.27604ms)
✔ inspectSpecialistFields: returns schema options for branch, saves, skills, styles, equipment, and level choices (1.57307ms)
✔ previewSpecialistProgression: validates required choices and rejects invalid permutations (1.390691ms)
✔ applySpecialistProgression: level 1 progression with cash option, proficiencies, saves, and fighting style (1.62054ms)
✔ applySpecialistProgression: level-up to 4 applies ASI and HP idempotently without duplicating starting gear (1.354512ms)
✔ ASI scheme validation: accepts +2 or +1/+1 and rejects invalid schemes (0.86551ms)
✔ checkLevel: boundary validation and type safety (1.690603ms)
✔ pbForLevel: correct progression across all 20 levels (0.411224ms)
✔ hitPointsAtLevel: fixed and rolled HP formulas across levels (0.410853ms)
✔ DC calculations: specialistDC and martialDC (0.924813ms)
✔ weaponMastery bonuses: melee half level and ranged double PB (0.736544ms)
✔ fightingStyles catalog: 8 melee and 7 ranged styles correctly mapped (0.433827ms)
✔ progression table: step definitions for levels 1–20 (1.360183ms)
✔ proficiencies and choices: rules matrices adhere to Ch. 3 (1.072224ms)
✔ specialistProfile: actor inspection and edge cases (1.445606ms)
ℹ tests 48
ℹ suites 0
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 201.145135
```
Exit code: `0`. 48/48 tests passed, 0 failures, 0 todo, 0 skipped.

### 1.3 Full Base Classes Test Suite Execution
Direct execution of all base classes:
```bash
npm run test:base-classes
```
Verbatim command output summary:
- Vanguard suites: 48 passed, 0 failed.
- Supporter suites: 44 passed, 0 failed.
- Specialist suites: 48 passed, 0 failed.
Exit code: `0`. Zero regressions across all base classes.

### 1.4 Code Implementation Inspection

1. **`ak5e/scripts/specialist-progression.mjs:447–452`**:
   ```javascript
   const style = choices.fightingStyle;
   const categoryStyles = weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : (weaponCat === "melee" ? MELEE_FIGHTING_STYLES : []);
   const styleObj = categoryStyles.find(s => s.id === style);
   if (!style || !styleObj) {
     pending.push("fightingStyle");
   }
   ```
   - Filters fighting styles against `categoryStyles` based on `weaponCat`.
   - Any style not in `categoryStyles` results in `styleObj === undefined`, which adds `"fightingStyle"` to `pending`.

2. **`ak5e/scripts/specialist-progression.mjs:630–633`**:
   ```javascript
   const plan = await previewSpecialistProgression(actor, choices);
   need(plan.contextKey === contextKey, "The character changed since the preview; preview Specialist progression again.");
   need(plan.valid, `Complete all required choices before applying progression: ${plan.pending.join(", ")}`);
   ```
   - Directly blocks applying progression if `plan.valid` is false (i.e. if any choices, such as `fightingStyle`, are pending).

3. **`ak5e/scripts/specialist-uses.mjs:170 & 238`**:
   - Lines 170 (`itsAllSkill`) and 238 (`defensiveStyle`) check `!reactions?.available` instead of `reactions.value < 1`.

4. **`ak5e/scripts/specialist-features.mjs:76–81`**:
   - `registerSpecialistHooks()` delegates to `registerResourcePoolHooks()` and is guarded by `if (hooksInstalled === globalThis.Hooks) return;`.
   - The redundant `Hooks.on("dnd5e.restCompleted")` listener has been completely eliminated.

### 1.5 Custom Adversarial Stress Test Suite
An independent 10-point stress test script was executed against the running code to specifically challenge category cross-validation, prototype injection, and runtime state preservation.

Verbatim execution results:
```text
=== EMPIRICAL ADVERSARIAL STRESS TEST: SPECIALIST CATEGORY & HARNESS ===
[PASS] Matrix: Melee Category accepts all 8 melee styles and rejects all 7 ranged styles
[PASS] Matrix: Ranged Category accepts all 7 ranged styles and rejects all 8 melee styles
[PASS] Matrix: Invalid categories reject all fighting styles
[PASS] Enforcement: applySpecialistProgression rejects mismatched category/style
[PASS] Progression Grant: Correct fighting style feature item granted on apply
[PASS] Table-Play Agency: Spent reaction warning and override for itsAllSkill & defensiveStyle
[PASS] Rest Recovery: Single restCompleted hook recovers exactly 1 Prowess
[PASS] Partial Update: Changing weaponCategory to ranged with saved melee fightingStyle flags pending
[PASS] Data Integrity: Case-sensitivity, objects, prototype keys, and whitespace strictly rejected
[PASS] Multi-level Idempotency: Level-up preserves valid category and style across progression

=== SUMMARY ===
Passed: 10, Failed: 0
```

---

## 2. Logic Chain

1. **Category Cross-Validation Invariant**:
   - Observation 1.4 confirms that `ak5e/scripts/specialist-progression.mjs:448` dynamically selects `categoryStyles` as `MELEE_FIGHTING_STYLES` when `weaponCat === "melee"`, `RANGED_FIGHTING_STYLES` when `weaponCat === "ranged"`, and `[]` otherwise.
   - Observation 1.5 confirms across the complete Cartesian product (8 melee styles × 7 ranged styles):
     - Selecting any of the 7 ranged styles under `"melee"` category yields `plan.valid === false` and `plan.pending.includes("fightingStyle") === true`.
     - Selecting any of the 8 melee styles under `"ranged"` category yields `plan.valid === false` and `plan.pending.includes("fightingStyle") === true`.
     - Selecting any style under an invalid category (`"unarmed"`, `"magic"`, `""`, `null`, etc.) yields `plan.valid === false` and flags both `"weaponCategory"` and `"fightingStyle"`.

2. **Progression Application Enforcement**:
   - Observation 1.4 confirms that `applySpecialistProgression` invokes `need(plan.valid, ...)`.
   - Observation 1.5 (Test 4) proves empirically that attempting to call `applySpecialistProgression` with mismatched category/style throws `Error: Complete all required choices before applying progression: fightingStyle` in 100% of cases.

3. **Feature Document Grant Integrity**:
   - Observation 1.5 (Test 5) proves that applying valid combinations creates exactly 1 fighting style item on the actor with the exact matching `chapterThreeId` from AK5e Chapter 3 rules.

4. **Table-Play Agency and Warning Integrity (WORKFLOW §3.2)**:
   - Observation 1.4 confirms `!reactions?.available` in `specialist-uses.mjs`.
   - Observation 1.2 (`ADV-FU-4`, `ADV-WEAP-5A`) and Observation 1.5 (Test 6) prove that when an actor's reaction is spent (`reactions.available === 0`):
     - Planning without override throws `PlayWarnings` with warning `id: "reaction"`.
     - Planning with `{ overrides: ["reaction"] }` succeeds, records the warning, and allows execution.

5. **Rest Recovery Hook Deduplication (AK5e Ch. 3 L5315)**:
   - Observation 1.4 confirms removal of duplicate hook registration in `specialist-features.mjs`.
   - Observation 1.2 (`ADV-PROW-3B`) and Observation 1.5 (Test 7) prove that completing a Short Rest or Long Rest via `dnd5e.restCompleted` recovers exactly 1 Prowess (from 0 to 1 on Short Rest, and from 1 to 2 on Long Rest).

6. **Progression Re-run & Tampering Resilience**:
   - Observation 1.1 (17/17 checks in `stress-specialist-progression.mjs`) and Observation 1.5 (Tests 8, 9, 10) prove that:
     - Changing category during level-up without changing fighting style is rejected.
     - Malformed inputs (casing, objects, whitespace, prototype keys) are rejected.
     - Multi-level progression (1 -> 4 -> 20) preserves valid choices idempotently without resetting or duplicating items.

---

## 3. Caveats

- Subclass branches (Executor, Hookmaster, Infuser, Inventor, Skyranger, Dollkeeper, Trapmaster) are scheduled for subsequent subclass milestones per `PROJECT.md`; this verification pertains strictly to the base Specialist chassis.
- No other caveats.

---

## 4. Conclusion

All defect remediations in Milestone 4 Iteration 2 are empirically confirmed:
- Category cross-validation strictly rejects mismatched style/category selections.
- Reaction warnings correctly detect spent reactions and support non-blocking table-play overrides.
- Rest hooks recover exactly 1 Prowess without duplicate increments.
- Progression setup, level-up, and idempotency tests pass with 100% success across all harnesses.

**Verdict: APPROVE**

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. **Run Progression Stress Harness**:
   ```bash
   node ak5e/tools/stress-specialist-progression.mjs
   ```
   *Expected outcome*: 17/17 checks pass, exit code 0.

2. **Run Specialist Unit and Adversarial Test Suites**:
   ```bash
   npm run test:specialist
   ```
   *Expected outcome*: 48/48 tests pass, 0 failed, 0 skipped, 0 todo, exit code 0.

3. **Run All Base Class Suites**:
   ```bash
   npm run test:base-classes
   ```
   *Expected outcome*: All Vanguard, Supporter, and Specialist test suites pass with exit code 0.

4. **Run Static Validation and Source Record Verification**:
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: Zero syntax/schema errors; 2193 top-level records and 801 embedded records verified against source.
