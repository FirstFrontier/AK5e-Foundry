# Handoff Report: Milestone 3 — Inventor Contraptions Adversarial Stress Test Suite

**Agent**: `challenger_m3`  
**Role**: Empirical Challenger (`critic`, `specialist`)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3/`  
**Recipient**: `cf5c8a2a-802f-473e-8274-6566de462e7c` (orchestrator_10)  
**Target File**: `ak5e/test/inventor-contraptions-adversarial.test.mjs`  
**Date**: 2026-10-20  

---

## 1. Observation

### 1.1 Authored Deliverables
Authored comprehensive adversarial test suite in `ak5e/test/inventor-contraptions-adversarial.test.mjs` (943 lines, 21 automated test cases) attacking all Milestone 3 features from AK5e Chapter 3 lines 5881–5946:
1. **Strange Contraption (Lv 5) & Stranger Contraptions (Lv 15)**:
   - `Vector 1.1`: Feature predicates & level gating for contraptions (`hasStrangeContraption`, `hasStrangerContraptions`).
   - `Vector 1.2`: Completeness and schema specifications for all 8 contraptions in `CONTRAPTIONS_CATALOG`.
   - `Vector 1.3`: 1/Long Rest per-option lockout and option independence (`getAvailableContraptions`).
   - `Vector 1.4`: Flashlight (Blinded on failed save; Stranger Lv 15 upgrade: Dazed on passed save).
   - `Vector 1.5`: Fun Toy (Construct stats: AC 18, HP 10, walk 20 ft, darkvision 60 ft, 10 min; Stranger Lv 15 upgrade: Invisible condition).
   - `Vector 1.6`: Musbeast Remover (10 ft radius, 4d8 Piercing; Stranger Lv 15 upgrade: Bleeding condition on failed save).
   - `Vector 1.7`: Needlefly Fumigator (20 ft radius, 2d8 Poison + Poisoned; Stranger Lv 15 upgrade: nominated ally immunity).
   - `Vector 1.8`: Portable Firestarter (10 ft radius, 2d8 Fire + Burning; Stranger Lv 15 upgrade: +INT bonus to ongoing burning damage).
   - `Vector 1.9`: Universal Keycard (traced vs Lv 15 traceless) and Unstable Contraption (5d8 vs Lv 15 8d8 Thunder).
2. **Mobile Modding (Lv 5)**:
   - `Vector 2.1`: Level gating (< Lv 5 rejection).
   - `Vector 2.2`: 1 Prowess spend and shortfall rejection/warning.
   - `Vector 2.3`: Inventions pool invariance (strictly 0 Inventions spent; pool value untouched).
   - `Vector 2.4`: Range (within 5 ft) and willing creature gate.
   - `Vector 2.5`: Exactly 1-minute temporary duration and duplicate modification rejection on target item.
3. **Inventor Prowess Gain Trigger**:
   - `Vector 3.1`: Creature who activated Inventor's mod this turn reduces enemy to 0 HP -> Inventor gains 1 Prowess.
   - `Vector 3.2`: Non-modded creature downing enemy -> 0 Prowess gained.
   - `Vector 3.3`: Modded creature who did not activate mod this turn downing enemy -> 0 Prowess gained.
   - `Vector 3.4`: 1/turn clamp (second down in same turn grants 0) and pool maximum cap clamp.
4. **The Big One (Lv 20)**:
   - `Vector 4.1`: Strictly requires level 20 (< 20 rejected) and 1/Long Rest limit.
   - `Vector 4.2`: Mode FLASH — 4 points, 10 ft radius, 8d6 Thunder + Burning. **Crucial adversarial test: Overlapping single-save & single-damage invariance** (creature inside multiple points saves only once and takes damage only once).
   - `Vector 4.3`: Mode SHARD — 50 ft cone, 10d6 Slashing + Bleeding. **Crucial adversarial test: Cover bonus bypass** (half cover +2 and 3/4 cover +5 bonuses ignored on save).
   - `Vector 4.4`: Mode QUASAR — 100x10 ft line, 14d6 Radiant damage (half on DEX save).

### 1.2 Verification Commands & Verbatim Outputs

#### Module File Validation:
```bash
node ak5e/tools/validate-files.mjs
```
**Verbatim Output**:
```text
Validated module.json, lang/en.json, and 290 .mjs files.
Exit code: 0
```

#### Test Suite Execution:
```bash
node --test ak5e/test/inventor-contraptions-adversarial.test.mjs
```
**Verbatim Output**:
```text
✔ Vector 1.1: Feature Predicates & Level Gating for Contraptions (5.864385ms)
✖ Vector 1.2: Contraptions Catalog Completeness & Specification (0.342152ms)
  Error: [Adversarial Assertion Failed] Required export 'CONTRAPTIONS_CATALOG' was not found in ak5e/scripts/inventor-features.mjs or specialist-rules.mjs. Ensure worker_m3 implements and exports it.
✖ Vector 1.3: 1/Long Rest Per-Option Lockout & Option Independence (0.284391ms)
  Error: [Adversarial Assertion Failed] Required export 'executeContraption' was not found in ak5e/scripts/inventor-features.mjs or specialist-rules.mjs. Ensure worker_m3 implements and exports it.
...
✖ Vector 2.2: Mobile Modding Prowess Accounting (1 Spend & Shortfall Rejection) (0.267812ms)
  Error: [Adversarial Assertion Failed] Required export 'executeMobileModding' was not found in ak5e/scripts/inventor-features.mjs or specialist-rules.mjs. Ensure worker_m3 implements and exports it.
...
✖ Vector 3.1: Prowess Gain on Downed Enemy by Mod-Activating Ally (0.302797ms)
  Error: [Adversarial Assertion Failed] Required export 'onCreatureReducedToZeroHP' was not found in ak5e/scripts/inventor-features.mjs or specialist-rules.mjs. Ensure worker_m3 implements and exports it.
...
✖ Vector 4.2: Mode FLASH - Overlapping Single-Save & Single-Damage Invariance (0.237242ms)
  Error: [Adversarial Assertion Failed] Required export 'executeTheBigOne' was not found in ak5e/scripts/inventor-features.mjs or specialist-rules.mjs. Ensure worker_m3 implements and exports it.
```

### 1.3 Implementation Inspection
Direct inspection of `ak5e/scripts/inventor-features.mjs` confirms:
- Existing exports from Milestone 1 and Milestone 2 (`hasStrangeContraption`, `hasMobileModding`, `hasRiskAssessment`, `hasStrangerContraptions`, `hasTheBigOne`, `calculateInstability`, `evaluateBreakdownRoll`, `MODIFICATIONS_CATALOG`, `executeModificationActivation`) are intact.
- The Milestone 3 functions (`CONTRAPTIONS_CATALOG`, `executeContraption`, `getAvailableContraptions`, `executeMobileModding`, `onCreatureReducedToZeroHP`, `executeTheBigOne`) are not yet defined or exported in `ak5e/scripts/inventor-features.mjs`.

---

## 2. Logic Chain

1. **Adversarial Harness Verification**:
   - `Vector 1.1` verifies existing level predicate functions (`hasStrangeContraption`, `hasStrangerContraptions`), passing cleanly and validating actor progression logic across levels 1, 4, 5, 14, 15, and 20.
2. **Missing Milestone 3 API Surfaces**:
   - `CONTRAPTIONS_CATALOG` is missing from `ak5e/scripts/inventor-features.mjs`. It must catalog all 8 options with 30 ft throw range, Action cost, and metadata.
   - `executeContraption(contraptionId, actor, options)` and `getAvailableContraptions(actor)` are missing. They must enforce the 1/Long Rest per-option limit such that burning one contraption leaves the other 7 available.
   - Stranger upgrades at Level 15 must be implemented in `executeContraption`:
     - Flashlight: successful save must apply `Dazed` condition until end of next turn.
     - Fun Toy: construct must gain `Invisible` condition.
     - Musbeast Remover: failed save must apply `Bleeding` condition.
     - Needlefly Fumigator: nominated creatures must take 0 damage, make no save, and suffer no condition.
     - Portable Firestarter: ongoing burning damage must add Inventor's INT modifier.
     - Universal Keycard: must remove lock tracelessly.
     - Unstable Contraption: damage must scale from 5d8 to 8d8 Thunder.
3. **Mobile Modding Invariants**:
   - `executeMobileModding(targetActor, targetItem, modificationId, actor, options)` must consume exactly 1 Prowess and 0 Inventions, require a willing creature within 5 ft, reject duplicate modifications on the target item, and apply a 1-minute temporary duration without refunding inventions upon expiration.
4. **Prowess Trigger Accounting**:
   - `onCreatureReducedToZeroHP(target, sourceActor, options)` must verify whether `sourceActor` activated an Inventor's modification this turn, incrementing Prowess by 1, while enforcing the 1/turn clamp and pool maximum ceiling.
5. **The Big One Invariants**:
   - `executeTheBigOne(mode, actor, options)` must enforce Level 20, 1/Long Rest limit, single-save invariance across overlapping FLASH points, cover bypass on SHARD, and 14d6 Radiant on QUASAR.

---

## 3. Caveats

- `ak5e/scripts/inventor-features.mjs` was not modified by this agent in strict compliance with the review-only constraint.
- The test harness supports standard alias names (`activateContraption`, `useTheBigOne`, `applyMobileModding`, etc.) in case worker_m3 uses alternative naming, but requires the underlying contracts to hold.

---

## 4. Conclusion

The adversarial stress test suite in `ak5e/test/inventor-contraptions-adversarial.test.mjs` is fully authored, validated against project standards (290 .mjs files valid), and ready. It will serve as the empirical challenge oracle once `worker_m3` delivers the Milestone 3 implementation.

---

## 5. Verification Method

To independently execute and verify the test harness:

```bash
# 1. Run the Milestone 3 adversarial stress test suite
node --test ak5e/test/inventor-contraptions-adversarial.test.mjs

# 2. Validate file syntax and module layout
node ak5e/tools/validate-files.mjs
```

Invalidation conditions:
- Any failure in `node ak5e/tools/validate-files.mjs`.
- Failure of `Vector 1.1` on valid Inventor actors.
