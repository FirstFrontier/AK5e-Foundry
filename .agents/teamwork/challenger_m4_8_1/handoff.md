# Adversarial Challenge Report — Milestone 4: Infuser Specialist Subclass

**Author**: challenger_m4_8_1 (Roles: critic, specialist)  
**Date**: 2026-10-17T11:51:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### Test Execution Commands & Outputs
An adversarial stress test suite was authored in `ak5e/test/infuser-adversarial.test.mjs` containing 13 targeted tests spanning all edge cases, formula boundaries, target restrictions, resource shortfalls, receipt lifecycles, and encounter-window undo reversibility.

Execution command:
```bash
node --test ak5e/test/infuser-adversarial.test.mjs
```

Verbatim test runner output:
```text
✔ Adversarial 1: Infuser DC Formula Boundaries & Toggles (4.873822ms)
✔ Adversarial 2: Target Restrictions & Non-Blocking Overrides (9.302284ms)
✖ Adversarial 3: Infusion State Replacement & Multi-Target Isolation (4.178335ms)
✔ Adversarial 4: Leverage CON Save Workflow, Dazed & Leverage Lockout Lifecycle (2.849889ms)
✔ Adversarial 5: Double-Blind Trial Preconditions, Dual Resource Shortfall Clamping & 1d6 Toxin Bounds (5.290207ms)
✔ Adversarial 6: Stimpack Questionable Rejuvenation Temp HP Rolls & Additive Procoagulant (3.533023ms)
✔ Adversarial 7: Excessive Dosing Toxin Scaling & Toxic Shock Mechanics (1.595815ms)
✔ Adversarial 8: To Defy Science 1/LR Pool & preApplyDamage Invulnerability Clamping (1.153191ms)
✔ Adversarial 9: Standard Plan Undo Reversibility (single apply, leverage, DBT, TDS) (4.124292ms)
✖ Adversarial 10: Overwriting applyInfusion Undo Reversibility (Prior Infusion Restoration) (1.821556ms)
✖ Adversarial 11: clearInfusion Undo Reversibility (Target Infusion Restoration) (1.38313ms)
✔ Adversarial 12: Receipt Status Lifecycle & Interactive Dice Verification (2.296623ms)
✔ Adversarial 13: Real Hooks.call Dispatch Integration & Listener Invariance (0.430652ms)
ℹ tests 13
ℹ suites 0
ℹ pass 10
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 192.60805
```

### Specific Verbatim Failure Details

#### Defect 1: Dotted UUID Key Path Expansion in `activeInfusions` (Adversarial 3)
```text
✖ Adversarial 3: Infusion State Replacement & Multi-Target Isolation (4.178335ms)
  AssertionError [ERR_ASSERTION]: Infuser tracks exactly 2 distinct targets without dotted UUID key path expansion polluting activeInfusions
  
  3 !== 2
  
      at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/infuser-adversarial.test.mjs:447:10)
      at async Test.run (node:internal/test_runner/test:1332:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:911:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 3,
    expected: 2,
    operator: 'strictEqual',
    diff: 'simple'
  }
```
Direct inspection of `infuser.flags.ak5e.infuser.activeInfusions` revealed:
```javascript
{
  'Actor.rnd_an4ksixxkhg': { type: 'focusHeightener', ... },
  'Actor': {
    'rnd_an4ksixxkhg': { type: 'focusHeightener', ... }
  },
  'Actor.rnd_bp2fe0mj299': { type: 'procoagulant', ... }
}
```
The dotted UUID key `'Actor.rnd_an4ksixxkhg'` was split by `setPropertyByPath` during update application, generating a phantom nested `'Actor'` property on `activeInfusions`.

#### Defect 2: In-Place Reference Mutation Corrupting Prior Infusion Undo (Adversarial 10)
```text
✖ Adversarial 10: Overwriting applyInfusion Undo Reversibility (Prior Infusion Restoration) (1.821556ms)
  AssertionError [ERR_ASSERTION]: Prior infusion A must be restored on target when overwriting apply is undone (WORKFLOW §3.2 reversibility)
  + actual - expected
  
  + 'focusHeightener'
  - 'adrenalineTrigger'
  
      at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/infuser-adversarial.test.mjs:869:10)
      at async Test.run (node:internal/test_runner/test:1332:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:911:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'focusHeightener',
    expected: 'adrenalineTrigger',
    operator: 'strictEqual',
    diff: 'simple'
  }
```
In `ak5e/scripts/specialist-uses.mjs`:
Line 1519 retrieves a direct mutable reference:
```javascript
const priorInfusion = targetActor ? getActiveInfusion(targetActor) : null;
```
Line 1535 mutates the object in-place on `targetActor`:
```javascript
targetActor.update({
  "flags.ak5e.infuser.activeInfusion": infusionRecord,
  "flags.ak5e.infuser.leverageLockout": false
});
```
Line 1567 assigns `receipt.priorInfusion = priorInfusion;`. Because `priorInfusion` was mutated in-place to `infusionRecord`, `receipt.priorInfusion` records the *new* infusion (`focusHeightener`). When `undo` is invoked, it restores the new infusion rather than the prior one (`adrenalineTrigger`), permanently losing the prior infusion. Furthermore, in `infuserCleanup` (lines 2018–2022), `delete actor.flags.ak5e.infuser.activeInfusions[targetUuid]` unconditionally deletes the infuser's tracking of that target even when a prior infusion was present.

#### Defect 3: Missing `clearInfusion` Handler in `infuserCleanup` (Adversarial 11)
```text
✖ Adversarial 11: clearInfusion Undo Reversibility (Target Infusion Restoration) (1.38313ms)
  AssertionError [ERR_ASSERTION]: Undoing clearInfusion MUST restore the cleared active infusion on targetActor (WORKFLOW §3.2 reversibility)
  + actual - expected
  
  + undefined
  - 'muscleStrengthener'
  
      at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/infuser-adversarial.test.mjs:904:10)
      at async Test.run (node:internal/test_runner/test:1332:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:911:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 'muscleStrengthener',
    operator: 'strictEqual',
    diff: 'simple'
  }
```
In `ak5e/scripts/specialist-uses.mjs`:
Lines 2003–2070 (`infuserCleanup`) handle `applyInfusion`, `leverageInfusion`, `doubleBlindTrial`, and `toDefyScience`. There is NO branch handling `receipt.command === "clearInfusion"`. When `clearInfusion` is undone via `specialistUses.undo(infuser, useId)`, `targetActor.flags.ak5e.infuser.activeInfusion` remains `null`/`undefined`.

---

## 2. Logic Chain

1. **WORKFLOW.md §3.2 Mandate**:
   Every action must be undoable within the encounter window. Reversibility requires that reverting an operation completely restores the state of affected actors, including unowned target tokens and the originating actor's resource/flag tracking.
2. **Defect 1 Deductions**:
   - In `applyInfusion` (`ak5e/scripts/specialist-uses.mjs` L1548), the infuser actor stores `activeInfusions[targetUuid] = ...`.
   - Foundry document paths interpret dots as property separators. Passing `"flags.ak5e.infuser.activeInfusions": newInfusionsOnInfuser` to `save(actor, state, updates)` causes `setPropertyByPath` to split `"Actor.<id>"` into an object `{ Actor: { <id>: ... } }`.
   - This corrupts the flag data structure, polluting the infuser's state with phantom keys and causing `Object.keys(activeInfusions).length` to report 3 instead of 2.
3. **Defect 2 Deductions**:
   - In `applyInfusion` (`ak5e/scripts/specialist-uses.mjs` L1519), `priorInfusion` holds a direct reference to `targetActor.flags.ak5e.infuser.activeInfusion`.
   - In-place mutation by `targetActor.update()` modifies `targetActor.flags.ak5e.infuser.activeInfusion` without cloning.
   - Consequently, `receipt.priorInfusion` points to the *new* infusion.
   - When the user clicks Undo on an overwriting `applyInfusion`, `receipt.priorInfusion` restores the newly applied infusion instead of the previous one. The previous infusion is unrecoverable.
   - Additionally, `infuserCleanup` (L2018–2022) unconditionally deletes `actor.flags.ak5e.infuser.activeInfusions[targetUuid]` instead of restoring `receipt.priorInfusion`.
4. **Defect 3 Deductions**:
   - In `ak5e/scripts/specialist-uses.mjs`, `clearInfusion` (L1861–1908) zeroes out `activeInfusion` on `targetActor`.
   - In `infuserCleanup` (L2003–2070), there is no `case "clearInfusion"`.
   - Generic rollback only reverts flags on the initiating `actor` (`infuser`), not on `targetActor`.
   - When `clearInfusion` is undone, `targetActor.flags.ak5e.infuser.activeInfusion` is never restored, remaining `undefined`.

---

## 3. Caveats

- Tests 1, 2, 4, 5, 6, 7, 8, 9, 12, and 13 passed cleanly (10/13 tests pass).
- The DC calculations, toggle options, target restrictions, Leverage CON save flow, Double-Blind Trial table mappings, dual resource clamp-at-0, Stimpack 1d10 interactive rolls and additive Procoagulant formula, Excessive Dosing scaling, To Defy Science invulnerability in `dnd5e.preApplyDamage`, receipt status lifecycle (`awaitingRoll` -> `complete`), and Hook listener idempotency were all empirically proven sound.
- The failure of Tests 3, 10, and 11 is strictly localized to `ak5e/scripts/specialist-uses.mjs`.

---

## 4. Conclusion

The worker's implementation for Milestone 4 is substantially complete and well-structured, but suffers from three concrete, reproducible defects that violate the encounter-window reversibility and flag integrity requirements of WORKFLOW.md §3.2:
1. Active infusion tracking pollution due to dotted key expansion.
2. In-place reference mutation destroying prior infusion state on overwrite undo.
3. Completely missing `clearInfusion` cleanup in `infuserCleanup`.

**Verdict**: **REQUEST_CHANGES**

### Actionable Remediation Plan for Implementer
In `ak5e/scripts/specialist-uses.mjs`:
1. **Fix Defect 1 (L1577 & L1900)**:
   In `applyInfusion` and `clearInfusion` updates, use the Foundry force-replace prefix `"==flags.ak5e.infuser.activeInfusions": newInfusionsOnInfuser` so that `setPropertyByPath` replaces the dictionary without splitting dotted UUID keys.
2. **Fix Defect 2 (L1519 & L2018–2023)**:
   Deep-clone the prior infusion before mutating `targetActor`:
   ```javascript
   const priorInfusion = targetActor ? structuredClone(getActiveInfusion(targetActor)) : null;
   ```
   In `infuserCleanup` (L2018–2023), when `receipt.priorInfusion` exists, restore it in `actor.flags.ak5e.infuser.activeInfusions[targetUuid]` instead of deleting it:
   ```javascript
   if (actor.flags?.ak5e?.infuser?.activeInfusions && targetUuid) {
     if (receipt.priorInfusion) {
       actor.flags.ak5e.infuser.activeInfusions[targetUuid] = {
         type: receipt.priorInfusion.type,
         name: receipt.priorInfusion.name,
         targetUuid,
         targetName: receipt.targetName,
         appliedAt: receipt.priorInfusion.appliedAt
       };
     } else {
       delete actor.flags.ak5e.infuser.activeInfusions[targetUuid];
     }
     if (typeof actor.update === "function") {
       actor.update({ "==flags.ak5e.infuser.activeInfusions": { ...actor.flags.ak5e.infuser.activeInfusions } });
     }
   }
   ```
3. **Fix Defect 3 (L1864 & L2003–2070)**:
   In `clearInfusion` (L1864), deep-clone `priorInfusion`:
   ```javascript
   const priorInfusion = targetActor ? structuredClone(getActiveInfusion(targetActor)) : null;
   ```
   Add a `clearInfusion` branch to `infuserCleanup`:
   ```javascript
   } else if (receipt.command === "clearInfusion") {
     const targetUuid = receipt.targetUuid ?? receipt.result?.targetUuid;
     const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;
     if (targetActor && receipt.priorInfusion) {
       if (typeof targetActor.update === "function") {
         targetActor.update({
           "flags.ak5e.infuser.activeInfusion": receipt.priorInfusion,
           "flags.ak5e.infuser.leverageLockout": false
         });
       } else if (targetActor.flags?.ak5e?.infuser) {
         targetActor.flags.ak5e.infuser.activeInfusion = receipt.priorInfusion;
         targetActor.flags.ak5e.infuser.leverageLockout = false;
       }
     }
     if (actor.flags?.ak5e?.infuser?.activeInfusions && targetUuid && receipt.priorInfusion) {
       actor.flags.ak5e.infuser.activeInfusions[targetUuid] = {
         type: receipt.priorInfusion.type,
         name: receipt.priorInfusion.name,
         targetUuid,
         targetName: receipt.targetName,
         appliedAt: receipt.priorInfusion.appliedAt
       };
       if (typeof actor.update === "function") {
         actor.update({ "==flags.ak5e.infuser.activeInfusions": { ...actor.flags.ak5e.infuser.activeInfusions } });
       }
     }
   }
   ```

---

## 5. Verification Method

To independently reproduce the failures:
```bash
node --test ak5e/test/infuser-adversarial.test.mjs
```

Invalidation conditions for remediation:
- All 13 tests in `ak5e/test/infuser-adversarial.test.mjs` must pass with 0 failures.
- All 15 tests in `ak5e/test/infuser.test.mjs` must continue to pass with 0 failures.
- `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` must exit 0.
