# Handoff Report: Milestone 3 Review & Adversarial Challenge (Contraptions & Advanced Features)

**Agent**: `reviewer_m3_10`  
**Roles**: Reviewer, Critic  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m3_10/`  
**Recipient**: `cf5c8a2a-802f-473e-8274-6566de462e7c` (orchestrator_10)  
**Date**: 2026-10-20  

---

## Review Summary

**Verdict**: **APPROVE**

No integrity violations were detected. All 8 Strange & Stranger Contraptions, Mobile Modding, the Inventor Prowess Gain Trigger, Risk Assessment Instability reductions, and The Big One modes adhere strictly to AK5e Chapter 3 rules (L5881–5946) and `WORKFLOW.md` §3.2 table-play guidelines. All unit tests and adversarial challenge vectors pass with zero failures.

---

## 1. Observation

### 1.1 Direct Inspection of Implementation (`ak5e/scripts/inventor-features.mjs`)
1. **Strange & Stranger Contraptions Catalog (`CONTRAPTIONS_CATALOG`, Lines 1838–1970)**:
   - Contains all 8 canonical options:
     - `flashlight` ("12 Million Lumen Flashlight"): Action cost, 30 ft throw range, 15 ft radius DEX save vs Inventor DC or Blinded until end of next turn; Stranger Lv 15: passed save applies Dazed until end of next turn.
     - `fun-toy` ("Fun Toy"): Action cost, 30 ft throw range, creates Mobile Camera construct (AC 18, HP 10, walk 20 ft, darkvision 60 ft, duration 10 min); Stranger Lv 15: construct gains Invisible condition.
     - `musbeast-remover` ("Musbeast Remover"): Action cost, 30 ft throw range, 10 ft radius sphere for 2 rounds, 4d8 Piercing damage (half on save), full cover immunity; Stranger Lv 15: failed save applies Bleeding rider.
     - `needlefly-fumigator` ("Needlefly Fumigator"): Action cost, 30 ft throw range, 20 ft radius sphere for 1 min (spreads around corners), 2d8 Poison + Poisoned (half on save); Stranger Lv 15: nominated creatures immune.
     - `over-tuned-speaker` ("Over-tuned Speaker"): Action cost, 30 ft throw range, audible up to 100 ft for 1 min; Stranger Lv 15: directional & volume controls.
     - `portable-firestarter` ("Portable Firestarter"): Action cost, 30 ft throw range, 10 ft radius, 2d8 Fire + Burning (half on save); Stranger Lv 15: +INT modifier to ongoing burning damage.
     - `universal-keycard` ("Universal Keycard"): Action cost, 30 ft throw range, 5 ft electronic lock removal, leaves trace; Stranger Lv 15: traceless.
     - `unstable-contraption` ("Unstable Contraption"): Action cost, 30 ft throw range, 10 ft radius, 5d8 Thunder (half on save); Stranger Lv 15: scales to 8d8 Thunder.
2. **Execution & Lockout Logic (`executeContraption`, Lines 2030–2322; `getAvailableContraptions`, Lines 1989–2014)**:
   - Gated to Specialist Inventor level >= 5 (`hasStrangeContraption`).
   - Tracks per-option daily usage under `flags.ak5e.inventor.usedContraptions`. Burning one contraption locks out only that option; the remaining 7 remain available.
   - Restores all options on Long Rest (`resetContraptions`, Line 2016).
   - In alignment with `WORKFLOW.md` §3.2, repeated daily usage emits `warning: "alreadyUsed"` rather than hard-crashing table play, while rejecting when `options.strictLockout: true`.
3. **Mobile Modding (`executeMobileModding`, Lines 2326–2388; Lines 941–967, 1016–1021)**:
   - Gated to Specialist Inventor level >= 5 (`hasMobileModding`).
   - Expends strictly 1 Prowess (`spendPool(inventorActor, "prowess", 1)`).
   - Does NOT decrement Inventions pool (`isMobileModding` flag passes 0 Inventions cost; pool unchanged).
   - Enforces distance (`<= 5` ft) and target willingness (`willing !== false`).
   - Enforces 1-minute expiration (`duration: "1min"`, `temporary: true`, `expiresAt: Date.now() + 60000`).
   - Removal/expiration of Mobile Modding does NOT refund Inventions pool (`wasMobileMod` check in `removeEquipmentModification`, Lines 1016–1021).
   - Rejects duplicate modifications on the target item (Line 936).
4. **Inventor Prowess Gain Trigger (`onCreatureReducedToZeroHP`, Lines 2392–2528; `resetInventorTurnTriggers`, Lines 2530–2545)**:
   - Verifies whether the source creature activated an Inventor's modification this turn (`flags.ak5e.inventor.activatedModsThisTurn` or `options.activatedModThisTurn`).
   - Awards 1 Prowess up to pool max (`pool.value < pool.max`).
   - Clamps at 1/turn via `prowessGainedZeroHpThisTurn`.
   - `resetInventorTurnTriggers` resets turn triggers upon turn advance.
5. **Risk Assessment (`calculateInstability`, Lines 745–782)**:
   - Gated to Level >= 11 (`hasRiskAssessment`).
   - Speciality Modding: -1 Instability for matching specialised weapon category.
   - Trained Operator: -1 Instability when wielded/worn by the Inventor.
   - Instability clamped at minimum of 1 (`Math.max(1, rawInstability)`).
6. **The Big One (`executeTheBigOne`, Lines 2548–2709; `resetTheBigOne`, Lines 2711–2726)**:
   - Gated to Level 20 (`hasTheBigOne`).
   - 1/Long Rest limit tracked via `theBigOne` pool and actor flags.
   - FLASH mode: 8d6 Thunder + Burning. Overlapping area deduplication via `uniqueTargets` Set guarantees creatures in multiple overlapping points make saving throw only once and take damage only once.
   - SHARD mode: 50 ft cone, 10d6 Slashing + Bleeding. Bypasses cover bonuses (`ignoresCover: true`, `coverIgnored: true`).
   - QUASAR mode: 100x10 ft line, 14d6 Radiant (half on save).

### 1.2 Verbatim Test Tool Commands & Results

1. **Milestone 3 Contraptions Unit & Adversarial Test Suites**:
   - Command: `node --test ak5e/test/inventor-contraptions.test.mjs ak5e/test/inventor-contraptions-adversarial.test.mjs`
   - Result:
     ```text
     ✔ Vector 1.1: Feature Predicates & Level Gating for Contraptions (4.471023ms)
     ✔ Vector 1.2: Contraptions Catalog Completeness & Specification (4.754104ms)
     ✔ Vector 1.3: 1/Long Rest Per-Option Lockout & Option Independence (2.878994ms)
     ✔ Vector 1.4: Adversarial Flashlight (Blinded on fail; Stranger Lv 15 Dazed on pass) (1.336591ms)
     ✔ Vector 1.5: Adversarial Fun Toy (Construct stats & Lv 15 Invisible Condition) (0.860553ms)
     ✔ Vector 1.6: Adversarial Musbeast Remover (4d8 Piercing & Lv 15 Bleeding Rider) (0.886732ms)
     ✔ Vector 1.7: Adversarial Needlefly Fumigator (Poison + Lv 15 Nominated Ally Immunity) (0.877535ms)
     ✔ Vector 1.8: Adversarial Portable Firestarter (2d8 Fire + Lv 15 +INT Ongoing Burn) (0.796671ms)
     ✔ Vector 1.9: Adversarial Universal Keycard & Unstable Contraption (5d8 vs Lv 15 8d8) (0.873768ms)
     ✔ Vector 2.1: Mobile Modding Level Gating (< Lv 5 Rejection) (0.849381ms)
     ✔ Vector 2.2: Mobile Modding Prowess Accounting (1 Spend & Shortfall Rejection) (2.388128ms)
     ✔ Vector 2.3: Mobile Modding Inventions Pool Invariance (Costs Strictly 0 Inventions) (0.788104ms)
     ✔ Vector 2.4: Mobile Modding Range (5 ft) & Willingness Verification (0.747898ms)
     ✔ Vector 2.5: Mobile Modding 1-Minute Duration & Duplicate Rejection (0.970944ms)
     ✔ Vector 3.1: Prowess Gain on Downed Enemy by Mod-Activating Ally (0.729692ms)
     ✔ Vector 3.2: Rejection of Non-Modded Creature Down Trigger (0.941887ms)
     ✔ Vector 3.3: Rejection if Mod Was NOT Activated This Turn (0.26192ms)
     ✔ Vector 3.4: 1/Turn Prowess Gain Clamp & Maximum Pool Cap (0.636185ms)
     ✔ Vector 4.1: The Big One Level Gating (< Lv 20 Rejection) & 1/LR Limit (0.867806ms)
     ✔ Vector 4.2: Mode FLASH - Overlapping Single-Save & Single-Damage Invariance (0.445901ms)
     ✔ Vector 4.3: Mode SHARD - Cover Bonus Bypass & Slashing + Bleeding (0.41392ms)
     ✔ Vector 4.4: Mode QUASAR - 100x10 Line & 14d6 Radiant Damage (0.334989ms)
     ✔ 1.1 Feature Predicates & Level Gating for Contraptions (8.208267ms)
     ✔ 1.2 Catalog Completeness & Specification for All 8 Contraptions (1.455458ms)
     ✔ 1.3 1/Long Rest Per-Option Lockout & Option Independence (2.215399ms)
     ✔ 1.4 Flashlight: Lv 5 Blinded on fail; Lv 15 Dazed on pass (1.28927ms)
     ✔ 1.5 Fun Toy: Mobile Camera construct stats & Lv 15 Invisible Condition (0.769389ms)
     ✔ 1.6 Musbeast Remover: 4d8 Piercing & Lv 15 Bleeding Rider (0.899517ms)
     ✔ 1.7 Needlefly Fumigator: 2d8 Poison + Poisoned & Lv 15 Nominated Ally Immunity (0.786091ms)
     ✔ 1.8 Portable Firestarter: 2d8 Fire + Burning & Lv 15 +INT Ongoing Burn Bonus (0.699315ms)
     ✔ 1.9 Universal Keycard & Unstable Contraption (5d8 vs Lv 15 8d8) (0.861785ms)
     ✔ 2.1 Mobile Modding Level Gating (< Lv 5 Rejection) (0.68612ms)
     ✔ 2.2 Mobile Modding Spends 1 Prowess & Rejects on Shortfall (2.191784ms)
     ✔ 2.3 Mobile Modding Inventions Pool Invariance (Costs Strictly 0 Inventions) (0.69688ms)
     ✔ 2.4 Mobile Modding Range (5 ft) & Willingness Verification (0.540892ms)
     ✔ 2.5 Mobile Modding 1-Minute Duration & Duplicate Rejection (0.873838ms)
     ✔ 3.1 Prowess Gain on Downed Enemy by Mod-Activating Ally (0.831868ms)
     ✔ 3.2 Rejection of Non-Modded Creature or Mod NOT Activated This Turn (0.431895ms)
     ✔ 3.3 1/Turn Prowess Gain Clamp & Maximum Pool Cap (5.041904ms)
     ✔ 4.1 Risk Assessment Instability Reductions & Speciality Modding (0.673365ms)
     ✔ 5.1 The Big One Level Gating (< Lv 20 Rejection) & 1/LR Limit (1.028523ms)
     ✔ 5.2 Mode FLASH: Overlapping Single-Save Invariance & 8d6 Thunder + Burning (0.39319ms)
     ✔ 5.3 Mode SHARD: 50 ft Cone, 10d6 Slashing + Bleeding, Ignores Cover (0.3563ms)
     ✔ 5.4 Mode QUASAR: 100x10 ft Line & 14d6 Radiant Damage (0.401687ms)
     ℹ tests 44
     ℹ suites 0
     ℹ pass 44
     ℹ fail 0
     ℹ duration_ms 185.630242
     ```
   - Exit code: 0.

2. **Full Inventor Subclass Regression (Milestones 1, 2, 3 + Adversarial)**:
   - Command: `node --test ak5e/test/inventor.test.mjs ak5e/test/inventor-modifications.test.mjs ak5e/test/inventor-contraptions.test.mjs ak5e/test/inventor-adversarial.test.mjs ak5e/test/inventor-modifications-adversarial.test.mjs ak5e/test/inventor-contraptions-adversarial.test.mjs`
   - Result: `tests 144, pass 144, fail 0, duration_ms 223.067566`.
   - Exit code: 0.

3. **Full Specialist Class Regression Suite**:
   - Command: `npm run test:specialist`
   - Result: `tests 127, pass 127, fail 0, duration_ms 317.129897`.
   - Exit code: 0.

4. **Repository Validation**:
   - Command: `node ak5e/tools/validate-files.mjs`
   - Result: `Validated module.json, lang/en.json, and 291 .mjs files.`
   - Exit code: 0.

5. **Source Content Verification**:
   - Command: `node ak5e/tools/verify-generated-content.mjs`
   - Result: `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source. Top-level records: 2193; Chapter 6 embedded features: 801.`
   - Exit code: 0.

---

## 2. Logic Chain

1. **Integrity Verification**:
   - Inspected source code in `ak5e/scripts/inventor-features.mjs` and `ak5e/scripts/specialist-rules.mjs` for hardcoded return values matching test inputs. Calculations are parameterized across actor abilities, proficiencies, item properties, and options.
   - Evaluated mock fixtures in `ak5e/test/base-classes-fixture.mjs` and test files: verified tests operate against genuine state objects (`system.abilities`, `system.attributes`, `flags.ak5e.resourcePools`, `flags.ak5e.inventor`), without facade stubs that pre-approve calls.
   - Confirmed no shortcuts bypass intended logic: resource pools (`prowess`, `inventions`, `theBigOne`) execute real spend/refund/lockout operations.
   - **Conclusion**: Integrity check PASSED. Zero integrity violations detected.

2. **Completeness & Rules Fidelity**:
   - Verified all 8 contraptions exist in `CONTRAPTIONS_CATALOG` with exact AK5e Ch. 3 values: 30 ft throw range, Action cost, appropriate areas and damage formulas.
   - Verified Stranger Lv 15 upgrades: Flashlight applies Dazed on pass; Fun Toy construct has Invisible condition; Musbeast Remover applies Bleeding on fail; Needlefly Fumigator respects nominated ally immunity; Firestarter adds +INT to ongoing burn; Universal Keycard is traceless; Unstable Contraption upgrades from 5d8 to 8d8 Thunder.
   - Verified Mobile Modding consumes 1 Prowess and 0 Inventions, requires <= 5 ft distance and willing creature, applies a 1-minute temporary duration, and rejects duplicate modifications.
   - Verified Inventor Prowess Gain Trigger enforces mod activation this turn, 1/turn clamp, and pool max cap.
   - Verified Risk Assessment applies -1 Instability for Speciality Modding and -1 for Trained Operator, with minimum 1 clamp.
   - Verified The Big One requires Level 20, enforces 1/Long Rest, deduplicates overlapping FLASH targets so only 1 save/damage instance occurs, ignores cover bonuses on SHARD, and scales QUASAR to 14d6 Radiant.
   - **Conclusion**: Rules fidelity check PASSED.

3. **Adversarial Challenge & Stress-Testing**:
   - Tested lockout independence: using 1 contraption leaves the remaining 7 available.
   - Tested double-downing in the same turn: second down produces 0 prowess gain.
   - Tested overlapping areas in The Big One: targets inside multiple 10 ft circles save and take damage only once.
   - Tested cover bonus bypass: +2 and +5 cover bonuses are ignored against SHARD.
   - **Conclusion**: Adversarial stress tests PASSED.

---

## 3. Caveats

- **Headless Live Foundry Session**: Functional behavior was verified through Node.js test runner against Foundry VTT data model fixtures (`base-classes-fixture.mjs`). Live Chromium browser verification is delegated per `AGENTS.md` §6.2.
- **Lockout Warning vs Hard Throw**: Lockout re-use returns `warning: "alreadyUsed"` in line with `WORKFLOW.md` §3.2 non-blocking table-play guidance, while throwing when `options.strictLockout: true`. Both modes are tested and operational.

---

## 4. Conclusion

Milestone 3 (Inventor Contraptions, Mobile Modding, Risk Assessment, and The Big One) is fully implemented, completely tested, and verified with zero defects or integrity violations. The implementation is ready for deployment.

**Verdict**: **APPROVE**

---

## 5. Verification Method

To independently reproduce this verification:

```bash
# 1. Run Milestone 3 Contraptions Unit & Adversarial Tests
node --test ak5e/test/inventor-contraptions.test.mjs ak5e/test/inventor-contraptions-adversarial.test.mjs

# 2. Run all Inventor Tests (144 tests)
node --test ak5e/test/inventor.test.mjs ak5e/test/inventor-modifications.test.mjs ak5e/test/inventor-contraptions.test.mjs ak5e/test/inventor-adversarial.test.mjs ak5e/test/inventor-modifications-adversarial.test.mjs ak5e/test/inventor-contraptions-adversarial.test.mjs

# 3. Run all Specialist Regression Tests (127 tests)
npm run test:specialist

# 4. Run Module File Validation
node ak5e/tools/validate-files.mjs

# 5. Run Source Rules Content Verification
node ak5e/tools/verify-generated-content.mjs
```

Invalidation conditions:
- Any test failure or unhandled rejection in the commands above.
- Inventions pool decrementing upon Mobile Modding execution.
- Overlapping FLASH targets saving more than once or taking duplicated damage.
- Cover bonuses being added to saving throws against SHARD.
