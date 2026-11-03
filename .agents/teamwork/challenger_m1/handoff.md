# Handoff Report: Milestone 1 — Inventor Adversarial Stress Test Suite

**Agent**: `challenger_m1`  
**Role**: Empirical Challenger (critic, specialist)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m1/`  
**Target File**: `ak5e/test/inventor-adversarial.test.mjs`  
**Date**: 2026-10-20  

---

## 1. Observation

### 1.1 Authored Deliverables
Authored `ak5e/test/inventor-adversarial.test.mjs` (405 lines), containing 24 distinct, automated adversarial tests across 5 attack vectors targeting the Inventor Specialist subclass, Instability mechanics, breakdown dice mathematics, HP loss clamping, dangerous rider isolation, and Inventions resource pool integrity.

### 1.2 Verification Commands and Tool Outputs

#### Test Execution Command:
```bash
node --test ak5e/test/inventor-adversarial.test.mjs
```

**Verbatim Execution Output**:
```text
✔ Vector 1.1: Instability with 0 modifications returns 0 (unmodified equipment is safe) (3.251411ms)
✔ Vector 1.2: Instability with 1 standard modification evaluates to base 3 (1.170062ms)
✔ Vector 1.3: Instability with 1 dangerous modification evaluates to base 3 + 1 = 4 (0.673424ms)
✔ Vector 1.4: Instability with multiple modifications scales correctly (+1 per extra, +1 per dangerous) (5.129501ms)
✔ Vector 1.5: Level 11 Risk Assessment reductions stack (-1 Speciality Modding, -1 Trained Operator) (1.299017ms)
✔ Vector 1.6: Instability reduction clamping ensures Instability NEVER drops below 1 (0.708562ms)
✔ Vector 2.1: Instability = 1 rolling 1d6 CANNOT have duplicate dice (breakdown probability is strictly 0%) (0.431112ms)
✔ Vector 2.2: Instability >= 7 rolling 7d6+ MUST ALWAYS trigger breakdown (Dirichlet Pigeonhole Principle) (0.936807ms)
✔ Vector 2.3: Arbitrary dice arrays with ALL distinct values evaluate to breakdown === FALSE (0.371278ms)
✔ Vector 2.4: Arbitrary dice arrays with at least one matching pair evaluate to breakdown === TRUE (0.378321ms)
✔ Vector 2.5: Multi-way matches (triples, quads, two pairs, full house) evaluate to breakdown === TRUE (0.264183ms)
✔ Vector 2.6: Generative property-based test for dice evaluation (0.60315ms)
✔ Vector 3.1: Damage formula scaling: 1d8 + max(0, Instability - 3)d8 (0.258443ms)
✔ Vector 3.2: HP Clamping at 1 HP: applied damage MUST be 0 and HP cannot drop below 1 (0.249426ms)
✔ Vector 3.3: HP Clamping at 5 HP with roll of 8 deals exactly 4 damage (remaining HP = 1) (0.24123ms)
✔ Vector 3.4: Parametric sweep across current HP (1..50) and rolled damage (1..100) (0.388711ms)
✔ Vector 4.1: Activating a Dangerous mod that breaks down MUST flag equipment as broken (0.267259ms)
✔ Vector 4.2: Activating a NON-DANGEROUS mod on a mixed item damages HP but MUST NOT break equipment (0.311775ms)
✔ Vector 4.3: Broken equipment blocks usage until repaired by Maintenance Kit (0.633828ms)
✔ Vector 5.1: Duplicate modifications on the same equipment piece are strictly prohibited (1.474091ms)
✔ Vector 5.2: Modifications on magical items are strictly prohibited (0.409421ms)
✔ Vector 5.3: Cross-category modification gating rejects incompatible equipment (0.447724ms)
✔ Vector 5.4: Inventions pool accounting (application consumes, removal refunds, overdraw clamped) (1.844558ms)
✔ Vector 5.5: 1-week maintenance expiry tracking (0.486558ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 169.500164
```

#### Module File Validation:
```bash
node ak5e/tools/validate-files.mjs
```

**Verbatim Output**:
```text
Validated module.json, lang/en.json, and 286 .mjs files.
Exit code: 0
```

---

## 2. Logic Chain

1. **Vector 1: Instability Boundary Conditions**:
   - `calculateInstability(item, actor)` returns 0 when item has 0 modifications (Ch. 3 L5864).
   - Base instability is 3 for 1 standard modification.
   - 1 Dangerous modification evaluates to 4 (base 3 + 1 extra per Dangerous mod, L5954).
   - Additional modifications increment by +1 each: 2 standard = 4; 3 standard = 5; 3 standard + 1 dangerous = 7; 2 standard + 2 dangerous = 8.
   - At Level 11, Risk Assessment grants two independent reductions:
     - Speciality Modding: -1 on weapons matching Weapon Specialisation.
     - Trained Operator: -1 on equipment wielded/worn by the Inventor.
     - Both stack for -2 total when the Inventor wields their specialised weapon.
     - When an ally wields the Inventor's specialised weapon, Speciality Modding still applies (-1) while Trained Operator does not (0), resulting in -1 reduction. When an ally wields a non-specialised weapon, 0 reductions apply.
   - Floor clamping: Instability is clamped at `Math.max(1, instability)`. Even with multiple stacked reductions on a single-mod item, it cannot drop below 1.

2. **Vector 2: Breakdown Roll Mathematics & Generative Boundaries**:
   - At Instability 1 (1d6), duplicate dice cannot exist across any of the 6 faces `[1]` through `[6]`. Breakdown probability is strictly 0.00%.
   - At Instability >= 7 (7d6+), Dirichlet's Box (Pigeonhole) Principle dictates that rolling $\ge 7$ six-sided dice guarantees at least two matching faces. A generator running 100 randomized trials confirmed 100% breakdown occurrence.
   - Arbitrary arrays with distinct faces (`[1, 2]`, `[1, 3, 5]`, `[2, 4, 6]`, `[1, 2, 3, 4, 5, 6]`) evaluate to `isBreakdown === false`.
   - Matching pairs (`[2, 2]`, `[6, 6]`, `[1, 1, 4]`, `[2, 4, 2]`) and multi-way matches (triples `[3, 3, 3]`, quads `[2, 2, 2, 2]`, full house `[4, 4, 4, 5, 5]`) evaluate to `isBreakdown === true`.
   - Property-based generator: For any randomly generated distinct subset of `{1..6}`, duplicating any member instantly flips breakdown from false to true across 50 iterations.

3. **Vector 3: Breakdown HP Loss Formula & Clamping**:
   - Formula: $1\text{d}8 + \max(0, \text{Instability} - 3)\text{d}8$.
   - Evaluates to 1d8 at Instability 1, 2, and 3; 2d8 at 4; 3d8 at 5; 4d8 at 6; 5d8 at 7.
   - Clamping rule: "cannot reduce you below 1 Hit Point" (Ch. 3 L5864).
   - If creature has 1 HP, applied damage is strictly 0 regardless of damage rolled (e.g. roll of 8 or 64).
   - If creature has 5 HP and damage roll is 8, applied damage is strictly 4 (`5 - 1 = 4`), leaving exactly 1 HP.
   - Parametric sweep across starting HP 1..50 and rolled damage 1..100 verified `actualHPLoss === Math.min(damage, Math.max(0, HP - 1))` and remaining HP is strictly $\ge 1$ in all cases.

4. **Vector 4: Dangerous Breakdown Equipment Rider Isolation**:
   - Activating a Dangerous modification (`laser-cutter`) on a breakdown triggers the rider: `isBroken === true` and `equipmentBroken === true` (Ch. 3 L5954).
   - Activating a Non-Dangerous modification (`boom-module`) on an item that *also* has a Dangerous mod installed inflicts HP loss but strictly DOES NOT mark the equipment as broken. The dangerous equipment breakdown consequence is cleanly isolated to activating the dangerous modification itself.
   - `isBrokenEquipment(item)` detects broken state; `repairBrokenEquipment(item, actor)` clears the broken flag cleanly. Repairing an unbroken item is a safe no-op.

5. **Vector 5: Inventions Pool Integrity & Modification Gating**:
   - Duplicate modifications on the same piece of equipment are strictly rejected.
   - Attempting to modify magical equipment (`magical === true` or non-mundane rarity) throws an error and is rejected.
   - Cross-category gating rejects applying melee-only modifications to armor or ranged weapons, armor modifications to weapons, or modifications to consumables.
   - Pool accounting: Level 1 Inventor starts with 4 Inventions ($2 \times \text{PB}$). Applying 4 modifications decrements pool to 0. Attempting a 5th modification with 0 available is rejected. Removing a modification refunds 1 Invention, enabling a subsequent application.
   - 1-week maintenance expiry: `appliedAt` timestamp is recorded on each modification for world time tracking.

---

## 3. Caveats

- **Scope Boundary**: These adversarial tests stress-test the core mathematical engine, boundary conditions, and state mutations in `ak5e/scripts/inventor-features.mjs` and `ak5e/scripts/specialist-rules.mjs`. UI rendering (ActorSheetV2 badges and DialogV2 controls) and live browser execution in Foundry V13 are validated in subsequent milestones (Milestones 4 and 5).
- **Maintenance Expiry Cleanup**: The 1-week expiry rule records `appliedAt`. Automatic removal on unmaintained items requires an active world-time event hook or sheet render check when world time advances by $\ge 604,800$ seconds.

---

## 4. Conclusion

The adversarial stress test suite in `ak5e/test/inventor-adversarial.test.mjs` is complete, fully functional, and verified. It rigorously attacks all 5 required edge-case vectors with 24 automated tests, including generative permutations and parametric sweeps. All 24 tests pass 100% against the implemented Inventor features, and all module files validate cleanly with 0 errors.

---

## 5. Verification Method

To independently verify the test suite and outcomes documented in this report:

1. **Run the Adversarial Test Suite**:
   ```bash
   node --test ak5e/test/inventor-adversarial.test.mjs
   ```
   *Expected outcome*: 24 tests run, 24 pass, 0 fail.

2. **Run File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome*: Validated 286 .mjs files, exit code 0.

3. **Invalidation Conditions**:
   - Any test failure in `ak5e/test/inventor-adversarial.test.mjs`.
   - Modifying Instability formula, breakdown duplicate matching logic, or HP clamping rule in `ak5e/scripts/inventor-features.mjs` without updating corresponding source rules.
