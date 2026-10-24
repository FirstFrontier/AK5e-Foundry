# Forensic Audit Report: Milestone 1 — Specialist Inventor Subclass

**Auditor Agent**: `auditor_m1_10`  
**Role**: Forensic Integrity Auditor (critic, specialist, auditor)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/auditor_m1_10/`  
**Target**: Milestone 1 (Specialist Inventor Subclass Core Chassis, Instability Engine, Breakdown Mechanics & Tests)  
**Integrity Mode**: Development (per `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

## 1. Observation

A forensic audit of Milestone 1 work products was conducted against the AK5e v1.3.1 Chapter 3 rules authority (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L5847–6140), `WORKFLOW.md` §3.2, and `ORIGINAL_REQUEST.md`.

### 1.1 Source Code Inspection

1. **`ak5e/scripts/specialist-rules.mjs`**:
   - `isInventor(actor)` (L335–346): Genuine predicate checking `isSpecialist(actor)` and validating branch identity against `specialistBranch(actor) === "inventor"`, subclass item ID `"subclass-specialist-inventor"`, identifier `"inventor"`, or item name.
   - `calculateInventorDC(actor)` (L348–353): Authentic calculation:
     ```javascript
     export function calculateInventorDC(actor) {
       const system = actor?.system ?? {};
       const intMod = Number(system.abilities?.int?.mod ?? 0);
       const pb = Number(system.attributes?.prof ?? pbForLevel(specialistLevel(actor) ?? 1));
       return Math.max(1, 8 + intMod + pb);
     }
     ```
     Accurately implements $8 + \text{INT Mod} + \text{PB}$ clamped at minimum floor 1.
   - `registerInventorPools()` (L355–380): Registers `inventions` pool (`max: "@prof * 2"`, `initial: "max"`, `appliesTo: actor => isInventor(actor)`) and `theBigOne` pool (`max: 1`, `initial: "max"`, `appliesTo: actor => isInventor(actor) && (specialistLevel(actor) >= 20)`).
   - `calculateSpecialistProfile(actor)` (L388–460): Computes `dc.inventor` and registers `resources.inventions = { max: pb * 2, recovery: "Long Rest" }`.

2. **`ak5e/scripts/inventor-features.mjs`**:
   - Zero hardcoded return values, zero short-circuit bypasses, zero facade stubs or `TODO` comments.
   - `MODIFICATIONS_CATALOG` (L155–469): 28 distinct frozen modification schemas across Melee (10, 1 dangerous: `laser-cutter`), Ranged (8, 1 dangerous: `arts-cannon`), and Armor (10, 1 dangerous: `adrenal-overloader`).
   - `calculateInstability(item, actor, options)` (L522–550):
     ```javascript
     export function calculateInstability(item, actor, options = {}) {
       const mods = getItemModifications(item);
       const numMods = mods.length;
       if (numMods === 0 && !options.base) return 0;

       const base = Number(options.base ?? 3);
       const additionalMods = Math.max(0, numMods - 1);
       const numDangerous = mods.filter(m => m.isDangerous).length;

       let reductions = 0;
       if (options.riskAssessmentReductions !== undefined) {
         reductions = Number(options.riskAssessmentReductions);
       } else if (actor) {
         const isInventorActor = isInventor(actor);
         const hasRA = hasRiskAssessment(actor) || Boolean(options.hasRiskAssessment);
         if (hasRA && isInventorActor) {
           const matchesSpeciality = Boolean(options.specialityModding ?? isSpecialisedWeapon(actor, item));
           if (matchesSpeciality) reductions += 1;
           const isOperator = Boolean(options.trainedOperator ?? options.isInventorWielder ?? (item.actor === actor || item.parent === actor || options.wielder === actor));
           if (isOperator) reductions += 1;
         }
       }

       const rawInstability = base + additionalMods + numDangerous - reductions;
       return Math.max(1, rawInstability);
     }
     ```
     Accurately implements $\text{Base } 3 + (\text{numMods} - 1) + \text{numDangerous} - \text{reductions}$, clamped at 1. Unmodified items return 0.
   - `evaluateBreakdownRoll(rollResults, instability, activatedMod, options)` (L560–622):
     Counts frequency of dice outcomes in an $N\text{d}6$ roll via `Map`. Detects duplicate values ($c \ge 2$) without hardcoding. Calculates HP loss formula $1\text{d}8 + \max(0, \text{Instability} - 3)\text{d}8$ and clamps applied HP loss via `Math.min(rawDamage, Math.max(0, curHP - 1))`, ensuring target creature never drops below 1 HP. Flags `isBroken = true` if and only if breakdown occurred while activating a Dangerous modification.
   - `applyEquipmentModification` (L626–703) & `removeEquipmentModification` (L705–751):
     Validates equipment compatibility (non-magical weapon or armor), enforces duplicate restriction, checks and mutates the actor's `inventions` pool via `spendPool` / `refundPool`, updates `flags.ak5e.inventor.modifications` on the item document, and recalculates instability.
   - `repairBrokenEquipment` (L115–145): Clears `flags.ak5e.isBroken` and `flags.ak5e.inventor.isBroken`.

3. **`ak5e/scripts/specialist-progression.mjs`**:
   - `INVENTOR_PROGRESSION_FEATURES` (L233–253) and `getInventorProgressionFeatures(level)` (L255–269): Correctly maps features at levels 1, 3, 5, 11, 15, and 20.
   - `previewSpecialistProgression` (L551–568): Idempotently resolves and attaches pre-allocated Chapter 3 feature documents when Inventor branch is selected.

4. **`ak5e/DECISIONS.md`**:
   - Authoritative rulings recorded for:
     1. Dangerous Modifications & Breakdown Damage Rider (L2230–2237)
     2. Melee Attachment Attack Modifier Reading (L2238–2246)
     3. Instability Roll Timing (L2247–2252)

### 1.2 Independent Test Execution

Empirical test runs were executed directly via terminal commands:

1. **Inventor Unit Tests**:
   Command: `node --test ak5e/test/inventor.test.mjs`
   Result:
   ```text
   ✔ 1. Subclass Identification & Predicates (4.384864ms)
   ✔ 2. Inventor DC Calculations (8 + INT + PB) (1.068178ms)
   ✔ 3. Resource Pools Registration & Scaling (1.304849ms)
   ✔ 4. Modifications Catalog Schema & Completeness (1.009575ms)
   ✔ 5. Equipment Modification Validation (1.287636ms)
   ✔ 6. Equipment Modification Application & Inventions Locking (1.877281ms)
   ✔ 7. Equipment Modification Removal & Inventions Refund (1.244343ms)
   ✔ 8. Instability Engine Math & Risk Assessment Reductions (0.560219ms)
   ✔ 9. Breakdown Roll Evaluation & Duplicate Matching Dice Detection (0.538377ms)
   ✔ 10. Breakdown HP Loss Formula & Clamping at 1 HP (0.420843ms)
   ✔ 11. Dangerous Breakdown Equipment Rider (0.298028ms)
   ✔ 12. Broken Equipment State & Repair (0.387379ms)
   ✔ 13. Subclass Progression (Levels 1, 3, 5, 11, 15, 20) (1.811966ms)
   ✔ 14. Module API Wiring (0.255127ms)
   ℹ tests 14 | pass 14 | fail 0 | cancelled 0 | skipped 0 | duration_ms 171.324611
   ```

2. **Inventor Adversarial Suite**:
   Command: `node --test ak5e/test/inventor-adversarial.test.mjs`
   Result:
   ```text
   ✔ Vector 1.1: Instability with 0 modifications returns 0 (unmodified equipment is safe) (3.40312ms)
   ✔ Vector 1.2: Instability with 1 standard modification evaluates to base 3 (2.109805ms)
   ✔ Vector 1.3: Instability with 1 dangerous modification evaluates to base 3 + 1 = 4 (1.166205ms)
   ✔ Vector 1.4: Instability with multiple modifications scales correctly (+1 per extra, +1 per dangerous) (6.645375ms)
   ✔ Vector 1.5: Level 11 Risk Assessment reductions stack (-1 Speciality Modding, -1 Trained Operator) (2.995503ms)
   ✔ Vector 1.6: Instability reduction clamping ensures Instability NEVER drops below 1 (1.150093ms)
   ✔ Vector 2.1: Instability = 1 rolling 1d6 CANNOT have duplicate dice (breakdown probability is strictly 0%) (0.661843ms)
   ✔ Vector 2.2: Instability >= 7 rolling 7d6+ MUST ALWAYS trigger breakdown (Dirichlet Pigeonhole Principle) (1.519478ms)
   ✔ Vector 2.3: Arbitrary dice arrays with ALL distinct values evaluate to breakdown === FALSE (0.564627ms)
   ✔ Vector 2.4: Arbitrary dice arrays with at least one matching pair evaluate to breakdown === TRUE (0.720244ms)
   ✔ Vector 2.5: Multi-way matches (triples, quads, two pairs, full house) evaluate to breakdown === TRUE (0.42469ms)
   ✔ Vector 2.6: Generative property-based test for dice evaluation (0.683894ms)
   ✔ Vector 3.1: Damage formula scaling: 1d8 + max(0, Instability - 3)d8 (0.294652ms)
   ✔ Vector 3.2: HP Clamping at 1 HP: applied damage MUST be 0 and HP cannot drop below 1 (0.239907ms)
   ✔ Vector 3.3: HP Clamping at 5 HP with roll of 8 deals exactly 4 damage (remaining HP = 1) (0.221292ms)
   ✔ Vector 3.4: Parametric sweep across current HP (1..50) and rolled damage (1..100) (0.399171ms)
   ✔ Vector 4.1: Activating a Dangerous mod that breaks down MUST flag equipment as broken (0.29893ms)
   ✔ Vector 4.2: Activating a NON-DANGEROUS mod on a mixed item damages HP but MUST NOT break equipment (0.250468ms)
   ✔ Vector 4.3: Broken equipment blocks usage until repaired by Maintenance Kit (0.653867ms)
   ✔ Vector 5.1: Duplicate modifications on the same equipment piece are strictly prohibited (1.4999ms)
   ✔ Vector 5.2: Modifications on magical items are strictly prohibited (0.380295ms)
   ✔ Vector 5.3: Cross-category modification gating rejects incompatible equipment (0.449848ms)
   ✔ Vector 5.4: Inventions pool accounting (application consumes, removal refunds, overdraw clamped) (1.718919ms)
   ✔ Vector 5.5: 1-week maintenance expiry tracking (0.523529ms)
   ℹ tests 24 | pass 24 | fail 0 | cancelled 0 | skipped 0 | duration_ms 178.054166
   ```

3. **File Validation & Verification**:
   - `node ak5e/tools/validate-files.mjs`: Validated `module.json`, `lang/en.json`, and 287 `.mjs` files. Exit code 0.
   - `node ak5e/tools/verify-generated-content.mjs`: Verified all generated Chapter 1–6 records (2,193 top-level records, 801 embedded features). Exit code 0.

4. **Full Specialist Regression Suite**:
   Command: `node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor*.test.mjs ak5e/test/hookmaster*.test.mjs ak5e/test/infuser*.test.mjs`
   Result: `ℹ tests 127 | pass 127 | fail 0 | duration_ms 304.870716`.

---

## 2. Logic Chain

1. **Integrity Forensics Evaluation**:
   - Phase 1 investigation detected zero hardcoded outputs, zero mock values, zero bypasses, and zero fabricated artifact logs.
   - Inspection of `ak5e/scripts/inventor-features.mjs` showed mathematical expressions that evaluate dynamically from arguments and document flags rather than constant values.
   - The breakdown roll evaluator implements a true frequency distribution map across arbitrary dice arrays, confirmed by property-based generative random trials and the Dirichlet Pigeonhole principle.
   - State mutations in `applyEquipmentModification` and `removeEquipmentModification` directly call `spendPool` / `refundPool` and persist data to document flags via `setFlag` / `update`.

2. **Source Fidelity**:
   - `calculateInventorDC` strictly follows Chapter 3 L5852 ($8 + \text{INT Mod} + \text{PB}$).
   - `inventions` resource pool correctly mirrors Chapter 3 L5858 ($2 \times \text{PB}$).
   - Instability calculation strictly matches Chapter 3 L5864 (Base 3, +1 per additional mod, +1 extra for dangerous mods, and Risk Assessment reductions at level 11).
   - Breakdown roll duplicate condition, damage scaling ($1\text{d}8 + \max(0, \text{Instability}-3)\text{d}8$), and 1 HP minimum clamp match Chapter 3 L5864 verbatim.
   - Dangerous breakdown equipment damage and Maintenance Kit repair match Chapter 3 L5954–5956.

3. **Assertion Rigor**:
   - Both test suites assert specific numerical values, error regexes, deep object equality, and boolean states.
   - No assertions use degenerate comparisons (`assert.ok(true)` or `assert.equal(1, 1)`).

---

## 3. Caveats

- **Scope Boundary**: Milestone 1 implements the core chassis, formulas, Instability engine, Breakdown evaluation, equipment modification application/removal, catalog, progression, and rulings. Table-play UI controls, interactive sheet cards, and live Playwright browser sessions are allocated to subsequent project milestones.
- **Rulings Compatibility**: The three rulings in `ak5e/DECISIONS.md` resolve ambiguities in source phrasing (dangerous breakdown equipment damage isolation, melee attachment attack modifier options, and instability roll timing) without violating player agency or source mechanics.

---

## 4. Conclusion

The Milestone 1 work product for the AK5e Inventor Specialist Subclass has been forensically verified with empirical evidence across all required audit vectors. There are no instances of cheating, dummy logic, facade functions, or unauthentic test assertions.

Final Verdict: **CLEAN**

---

## 5. Verification Method

To independently verify this audit verdict, execute the following commands from the repository root:

```bash
# 1. Run Inventor unit tests
node --test ak5e/test/inventor.test.mjs

# 2. Run Inventor adversarial suite
node --test ak5e/test/inventor-adversarial.test.mjs

# 3. Validate codebase syntax and structure
node ak5e/tools/validate-files.mjs

# 4. Verify generated content fidelity
node ak5e/tools/verify-generated-content.mjs

# 5. Run full Specialist regression suite
node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor*.test.mjs ak5e/test/hookmaster*.test.mjs ak5e/test/infuser*.test.mjs
```
All commands must exit with code 0 and 0 failures.
