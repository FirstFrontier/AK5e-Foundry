# Handoff Report: Milestone 1 — Inventor Subclass Review & Adversarial Audit

**Agent**: `reviewer_m1_10`  
**Roles**: Reviewer, Adversarial Critic  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m1_10/`  
**Milestone**: Milestone 1 (Specialist / Inventor Subclass Core Chassis, Instability, Breakdown & Modifications Engine)  
**Parent / Recipient**: `cf5c8a2a-802f-473e-8274-6566de462e7c`  
**Verdict**: **APPROVE**  
**Date**: 2026-10-20  

---

## 1. Observation

### 1.1 Direct File Observations
1. **`ak5e/scripts/specialist-rules.mjs`**:
   - Lines 15, 25: Added `"subclass-specialist-inventor": "inventor"` to `SPECIALIST_BRANCH_IDS` and `"inventor"` to `IMPLEMENTED_SPECIALIST_BRANCHES`.
   - Lines 335–346: Implemented `isInventor(actor)` verifying actor has the Specialist class and Inventor subclass (via branch identifier, subclass document with `chapterThreeId: "subclass-specialist-inventor"`, or item name).
   - Lines 348–353: Implemented `calculateInventorDC(actor)`:
     ```javascript
     export function calculateInventorDC(actor) {
       const system = actor?.system ?? {};
       const intMod = Number(system.abilities?.int?.mod ?? 0);
       const pb = Number(system.attributes?.prof ?? pbForLevel(specialistLevel(actor) ?? 1));
       return Math.max(1, 8 + intMod + pb);
     }
     ```
   - Lines 355–380: Implemented `registerInventorPools()` (aliased as `defineInventorPools()`):
     - Registers `inventions` pool with `max: "@prof * 2"`, `initial: "max"`, `classId: SPECIALIST_CLASS_ID`, `levelBasis: "classLevel"`, `appliesTo: actor => isInventor(actor)`, and `recovery: [{ on: "lr", amount: "toMax" }]`.
     - Registers `theBigOne` pool with `max: 1`, `initial: "max"`, `classId: SPECIALIST_CLASS_ID`, `levelBasis: "classLevel"`, `appliesTo: actor => isInventor(actor) && (specialistLevel(actor) >= 20)`, and `recovery: [{ on: "lr", amount: "toMax" }]`.
   - Lines 415–421, 450: Updated `calculateSpecialistProfile(actor)` to include `intMod`, `dc.inventor = 8 + pb + intMod`, and `resources.inventions = { max: pb * 2, recovery: "Long Rest" }`.

2. **`ak5e/scripts/inventor-features.mjs` (752 lines)**:
   - Lines 42–70: Subclass feature level predicates (`hasEquipmentModification` at Lv 1, `hasStrangeContraption` and `hasMobileModding` at Lv 5, `hasRiskAssessment` at Lv 11, `hasStrangerContraptions` at Lv 15, `hasTheBigOne` at Lv 20).
   - Lines 74–102: Equipment inspection predicates (`isWeapon`, `isArmor`, `isModifiableEquipment`, `isMagicalEquipment` checking properties Set/Array/object and rarity).
   - Lines 104–145: Broken equipment status detection (`isBrokenEquipment`) and repair function (`repairBrokenEquipment`) clearing `flags.ak5e.isBroken`.
   - Lines 149–476: Full modifications catalog (`MODIFICATIONS_CATALOG`) containing all 28 modifications from Chapter 3 (10 Melee, 8 Ranged, 10 Armor; 3 Dangerous: Laser Cutter, Arts Cannon, Adrenal Overloader) with metadata, actions, and source IDs.
   - Lines 522–550: `calculateInstability(item, actor, options)`:
     - Returns 0 if item has 0 modifications.
     - Computes `base + Math.max(0, numMods - 1) + numDangerous - reductions`.
     - At Level 11+, applies Speciality Modding (-1 on matching weapon category) and Trained Operator (-1 when wielded/worn by Inventor).
     - Clamps at `Math.max(1, rawInstability)`.
   - Lines 560–622: `evaluateBreakdownRoll(rollResults, instability, activatedMod, options)`:
     - Detects duplicate dice via frequency counting across Array, `rollResults.dice[0].results`, and `rollResults.terms`.
     - Computes HP loss formula `${1 + Math.max(0, instability - 3)}d8`.
     - Clamps HP loss to never reduce creature below 1 HP: `Math.min(rawDamage, Math.max(0, curHP - 1))`.
     - Evaluates dangerous rider: `isBroken = Boolean(isBreakdown && isDangerousMod)`.
   - Lines 626–751: `applyEquipmentModification` and `removeEquipmentModification`:
     - Rejects non-modifiable, magical, and cross-category equipment.
     - Rejects duplicate modifications on the same item.
     - Locks 1 Invention on application (`spendPool`) and refunds 1 Invention on removal (`refundPool`), respecting `isMobileModding` exemptions.

3. **`ak5e/scripts/specialist-progression.mjs`**:
   - Lines 233–269: Defined `INVENTOR_PROGRESSION_FEATURES` for levels 1, 3, 5, 11, 15, and 20, and exported `getInventorProgressionFeatures(level)`.
   - Lines 551–568: Integrated Inventor branch feature preview and granting into `previewSpecialistProgression`.

4. **`ak5e/scripts/ak5e.mjs`**:
   - Lines 158–174: Imported all Inventor functions, catalog, and pool definitions.
   - Lines 379, 449–465: Exported `game.ak5e.specialist.isInventor` and `game.ak5e.specialist.inventor` namespace.
   - Line 601: Invoked `registerInventorHooks()` inside the Foundry `ready` lifecycle hook.

5. **`ak5e/DECISIONS.md`**:
   - Lines 2228–2256: Documented 3 authoritative rulings:
     1. Dangerous Modifications & Breakdown Damage Rider.
     2. Melee Attachment Attack Modifier Reading (default `1d8 + DEX mod`, optional `1d8 + DEX mod + PB`).
     3. Instability Roll Timing (rolls trigger only on deliberate modification activation, not on basic attacks or passive carrying).

### 1.2 Direct Empirical Tool Execution Results

1. **Inventor Unit Tests**:
   - Command: `node --test ak5e/test/inventor.test.mjs`
   - Result: 14 passed, 0 failed, 0 skipped in 164.2ms. Exit code 0.

2. **Inventor Adversarial Tests**:
   - Command: `node --test ak5e/test/inventor-adversarial.test.mjs`
   - Result: 24 passed, 0 failed, 0 skipped in 172.3ms. Exit code 0.

3. **File Validation**:
   - Command: `node ak5e/tools/validate-files.mjs`
   - Result: "Validated module.json, lang/en.json, and 287 .mjs files." Exit code 0.

4. **Specialist Regression Suite**:
   - Command: `node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor*.test.mjs ak5e/test/hookmaster*.test.mjs ak5e/test/infuser*.test.mjs`
   - Result: 127 passed, 0 failed, 0 skipped in 311.6ms. Exit code 0.

---

## 2. Logic Chain

1. **Formula & DC Correctness**:
   - Observation 1.1 shows `calculateInventorDC(actor)` computes `8 + intMod + pb` clamped at floor 1.
   - Profile generation in `calculateSpecialistProfile` reflects `profile.dc.inventor` and `profile.resources.inventions.max = pb * 2`.
   - Test suite 2 and test vector 1.1 verify that DC scales properly with INT and PB, correctly handles negative INT modifiers, and clamps at 1 for extreme negative modifiers.

2. **Resource Pools Integration**:
   - Observation 1.1 shows `registerInventorPools` defines `inventions` (`@prof * 2`, LR recovery) and `theBigOne` (max 1 at Lv 20, LR recovery).
   - Test suite 3 and test vector 5.4 verify pool initialization, scaling across levels 1, 5, 9, 17, and 20, pool spending on mod application, pool refunding on mod removal, and refusal when pool is depleted.

3. **Instability & Risk Assessment Mathematics**:
   - Observation 1.1 shows `calculateInstability` implements base 3 for single-mod item, +1 per extra mod, +1 per dangerous mod, and subtracts Risk Assessment reductions (-1 Speciality Modding, -1 Trained Operator) clamped at minimum 1. Unmodified items return 0.
   - Test suite 8 and test vectors 1.1–1.6 verify all combinations (0 mods -> 0; 1 standard -> 3; 1 dangerous -> 4; 2 standard -> 4; 3 standard + 1 dangerous -> 7; 2 standard + 2 dangerous -> 8; Lv 11 reductions to 5 or 6; floor clamp at 1).

4. **Breakdown Roll Evaluation & HP Loss Clamping**:
   - Observation 1.1 shows `evaluateBreakdownRoll` counts die frequencies to detect duplicate matches.
   - Dirichlet Pigeonhole Principle dictates rolling $\ge 7$ d6 guarantees a match; Vector 2.2 confirms 100% breakdown across 100 random trials.
   - At Instability 1 (1d6), duplicates are impossible; Vector 2.1 confirms 0% breakdown across all faces [1]..[6].
   - HP loss calculation evaluates to $1\text{d}8 + \max(0, \text{Instability} - 3)\text{d}8$.
   - Clamping logic `Math.min(rawDamage, Math.max(0, curHP - 1))` guarantees that applied damage cannot reduce current HP below 1. Vector 3.4 sweeps starting HP 1..50 and damage 1..100, verifying remaining HP is strictly $\ge 1$ in 100% of cases.

5. **Dangerous Modification Breakdown Rider Isolation**:
   - Observation 1.1 shows `isBroken = Boolean(isBreakdown && isDangerousMod)`.
   - Test suite 11 and test vectors 4.1–4.2 confirm that activating a standard modification on an item with dangerous modifications installed causes HP loss on breakdown but strictly does NOT disable the equipment.
   - When a dangerous modification breakdown occurs, `isBroken === true`, which is detected by `isBrokenEquipment` and cleared by `repairBrokenEquipment`.

6. **Integrity & Code Quality**:
   - Independent inspection of `specialist-rules.mjs` and `inventor-features.mjs` confirms zero hardcoding, zero facade stubs, and zero fake mocks.
   - All tests execute actual production methods and state mutations.
   - Module validation confirmed all 287 repository `.mjs` files are syntactically and structurally sound.

---

## 3. Caveats

- **Scope Boundary**: Milestone 1 implements the core rules engine, mathematical formulas, state validation, and catalog schemas. Interactive UI elements (such as ActorSheetV2 modification tabs, DialogV2 confirmation dialogs, and interactive chat cards for rolls) are part of later milestones (Milestone 4 and Milestone 5).
- **1-Week Maintenance Expiry**: Modifications record their `appliedAt` timestamp accurately. Automatic cleanup upon world-time advance requires world-time hook integration when time advances by $\ge 604,800$ seconds.

---

## 4. Conclusion

The Milestone 1 implementation of the Inventor Subclass is complete, rigorous, faithful to Chapter 3 source text, and fully verified:
- **Verdict**: **APPROVE**.
- All 5 review criteria are satisfied with zero regressions across the Specialist class test suite.
- Zero integrity violations were detected.

---

## 5. Verification Method

To independently reproduce and verify this review:

1. **Run Inventor Unit Tests**:
   ```bash
   node --test ak5e/test/inventor.test.mjs
   ```
   *Expected outcome*: 14 passed, 0 failed, 0 skipped.

2. **Run Inventor Adversarial Tests**:
   ```bash
   node --test ak5e/test/inventor-adversarial.test.mjs
   ```
   *Expected outcome*: 24 passed, 0 failed, 0 skipped.

3. **Run File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome*: Validated 287 .mjs files, exit code 0.

4. **Run Full Specialist Regression Suite**:
   ```bash
   node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor*.test.mjs ak5e/test/hookmaster*.test.mjs ak5e/test/infuser*.test.mjs
   ```
   *Expected outcome*: 127 passed, 0 failed, exit code 0.

5. **Invalidation Conditions**:
   - Any test failure in `inventor.test.mjs` or `inventor-adversarial.test.mjs`.
   - Modifying `calculateInventorDC`, `calculateInstability`, or `evaluateBreakdownRoll` formulas away from Chapter 3 specifications.
