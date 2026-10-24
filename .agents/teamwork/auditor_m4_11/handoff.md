# Forensic Audit Report — Milestone 4 (Inventor Subclass)

**Agent**: `auditor_m4_11`  
**Date**: 2026-10-20T07:18:00Z  
**Work Product**: Milestone 4: Specialist Inventor Subclass  
**Profile**: General Project  
**Integrity Mode**: development (`ORIGINAL_REQUEST.md` line 542)  
**Binary Verdict**: **INTEGRITY VIOLATION** (Rejected)  

---

## Forensic Audit Summary

| Check | Phase | Description | Result | Details |
|---|---|---|---|---|
| Check 1 | Phase 1: Source Analysis | Hardcoded test results detection | **PASS** | No hardcoded test outputs or string constants mimicking test returns in `specialist-uses.mjs`, `specialist-sheet.mjs`, or `inventor-features.mjs`. |
| Check 2 | Phase 1: Source Analysis | Facade implementation detection | **PASS** | Logic in `calculateInstability`, `evaluateBreakdownRoll`, `isBrokenEquipment`, `getItemModifications`, `applyEquipmentModification`, and `specialistUses` plans are genuine and authentic. |
| Check 3 | Phase 1: Source Analysis | Pre-populated verification artifacts | **PASS** | `find . -name '*.log' -o -name '*result*' -o -name '*output*'` found zero pre-existing test results or fabricated attestation logs. |
| Check 4 | Phase 2: Behavioral Verification | Build & run project test suite | **FAIL** | `npm test` fails with code 1. `registerInventorHooks` in `ak5e/scripts/inventor-features.mjs:45` attempts to assign to read-only property `inventor` of frozen `globalThis.game.ak5e.specialist`, crashing module initialization on Foundry `ready` hook. |
| Check 5 | Phase 2: Behavioral Verification | Milestone 4 specific test runner | **PASS** | `npm run test:specialist` executes 304 tests with 100% pass rate (304 pass, 0 fail). |
| Check 6 | Phase 2: Behavioral Verification | Static validation and source consistency | **PASS** | `node ak5e/tools/validate-files.mjs` (293 .mjs files validated) and `node ak5e/tools/verify-generated-content.mjs` (2,193 records verified) pass with 0 errors. |
| Check 7 | Table-Play Philosophy | WORKFLOW §3.2 & Table-Play Compliance | **PASS** | Mandatory confirmation before spend, non-blocking warnings with overrides, zero-clamping on shortfalls, awaitingRoll interactive buttons, GM target relay via `validateTarget`, and full encounter-window undo receipts verified. |

---

## 1. Observation

### Obs 1: Full Test Suite Failure (`npm test`)
Running `npm test` from the project root (`/home/patch/AK5e-Foundry`) terminates with exit code 1 during the `test:rules` phase (`node ak5e/tools/verify-chapter-one-helpers.mjs`).

**Command**: `npm test`  
**Exit Code**: 1  
**Verbatim Stderr / Output**:
```
> test:rules
> node ak5e/tools/verify-chapter-one-helpers.mjs && node --test ak5e/test/arts-rules.test.mjs ak5e/test/arts-sheet.test.mjs ak5e/test/world-rules.test.mjs ak5e/test/operator-*.test.mjs

file:///home/patch/AK5e-Foundry/ak5e/scripts/inventor-features.mjs:45
    globalThis.game.ak5e.specialist.inventor = {
                                             ^

TypeError: Cannot assign to read only property 'inventor' of object '#<Object>'
    at registerInventorHooks (file:///home/patch/AK5e-Foundry/ak5e/scripts/inventor-features.mjs:45:46)
    at Object.ready (file:///home/patch/AK5e-Foundry/ak5e/scripts/ak5e.mjs?helper-verification=1792480462169:601:3)
    at file:///home/patch/AK5e-Foundry/ak5e/tools/verify-chapter-one-helpers.mjs:37:7

Node.js v24.18.0
```

### Obs 2: Root Cause in `ak5e/scripts/inventor-features.mjs` and `ak5e/scripts/ak5e.mjs`
In `ak5e/scripts/ak5e.mjs` lines 361–466:
```javascript
361:     specialist: Object.freeze({
...
449:       inventor: Object.freeze({
450:         calculateDC: calculateInventorDC,
451:         calculateInstability,
452:         evaluateBreakdownRoll,
453:         applyEquipmentModification,
454:         removeEquipmentModification,
455:         repairBrokenEquipment,
456:         isBrokenEquipment,
457:         hasEquipmentModification,
458:         hasStrangeContraption,
459:         hasMobileModding,
460:         hasRiskAssessment,
461:         hasStrangerContraptions,
462:         hasTheBigOne,
463:         MODIFICATIONS_CATALOG,
464:         defineInventorPools
465:       })
466:     }),
```
At line 601 of `ak5e/scripts/ak5e.mjs`:
```javascript
597:   registerSpecialistHooks();
598:   registerExecutorHooks();
599:   registerHookmasterHooks();
600:   registerInfuserHooks();
601:   registerInventorHooks();
```
When `registerInventorHooks()` runs inside `ak5e.mjs`'s `ready` hook, it encounters lines 42–45 of `ak5e/scripts/inventor-features.mjs`:
```javascript
40: export function registerInventorHooks() {
41:   defineInventorPools();
42:   if (globalThis.game) {
43:     globalThis.game.ak5e ??= {};
44:     globalThis.game.ak5e.specialist ??= {};
45:     globalThis.game.ak5e.specialist.inventor = {
```
Because `globalThis.game.ak5e.specialist` is frozen via `Object.freeze` by `ak5e.mjs`, reassigning `globalThis.game.ak5e.specialist.inventor` throws `TypeError: Cannot assign to read only property 'inventor' of object '#<Object>'` in JavaScript strict mode (ESM modules are always strict). This crashes the module during Foundry initialization.

### Obs 3: Scoped Subclass Tests vs Module Integration
- `npm run test:specialist` exited 0 (304 tests passed, 0 failed).
- Scoped test suites (`ak5e/test/inventor-uses.test.mjs`, `ak5e/test/inventor.test.mjs`) pass because `base-classes-fixture.mjs` sets up a mock `globalThis.game = { ak5e: {} }` that does not freeze `game.ak5e.specialist`.
- The tests did not test importing or initializing `ak5e/scripts/ak5e.mjs`, masking the defect from the scoped runner.

### Obs 4: Table-Play & Subclass Logic Verification
The implementation logic of Milestone 4 was inspected line-by-line:
1. **Confirmation before spend**:
   - `specialist-uses.mjs`: Plans enforce confirmation check via `createPlayUses`. Unconfirmed operations throw `AK5eConfirmation` ("Confirm this use before applying it.") and commit zero state changes. Verified in `inventor-uses.test.mjs:176–246` and `inventor-tableplay-adversarial.test.mjs:224–350`.
2. **Non-blocking warnings & zero-clamping**:
   - Shortfall, level, broken equipment, life support HP (< 50%), and cooldowns emit non-blocking warnings via `warn(warnings, id, text)`. Overriding with `overrides: [...]` allows execution.
   - Resource pools clamp strictly at 0 via `spendResource` (`Math.max(0, before - amount)`). Shortfalls are tracked on `receipt.shortfalls`. Verified in `inventor-uses.test.mjs:340–373` and `inventor-tableplay-adversarial.test.mjs`.
3. **Never auto-roll dice**:
   - `activateModification`: Sets `receipt.status = "awaitingRoll"` and `receipt.formula = "${instability}d6"`. Dice are not rolled until `specialistUses.command(actor, "useRoll", { useId })`.
   - `strangeContraption` & `theBigOne`: Set `receipt.formula` and interactive roll labels without rolling on plan execution. Verified in `inventor-uses.test.mjs:407–470`.
4. **Automatic GM target relay**:
   - `specialist-uses.mjs:2653–2658`: `validateTarget` assigned to all 6 plans:
     `INVENTOR_PLANS.<plan>.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
   - Relayed changes verify target identity, preventing target spoofing.
5. **Reversible undo receipts**:
   - `inventorCleanup` in `specialist-uses.mjs:2660–2740`: Cleanly restores item modifications (`priorModifications`), un-breaks broken equipment (`isBroken: false`), removes temporary mobile modifications, clears contraption lockout (`usedContraptions`), and resets `theBigOneUsed`. Resource pools are restored by delta via `play-uses.mjs`.
6. **ActorSheetV2 UI**:
   - `specialist-sheet.mjs:93–108, 127–134, 595–607`: Injects `.ak5e-specialist-badge-inventions`, `.ak5e-specialist-badge-inventor-dc`, and `.ak5e-specialist-badge-mod-count`.
   - `specialist-sheet.mjs:250–269`: Adds Inventor action group buttons (`applyModification`, `removeModification`, `activateModification`, `mobileModding`, `strangeContraption`, `theBigOne`) triggering `confirmPlayUse`.

---

## 2. Logic Chain

1. **Rule**: Per the Forensic Verification Procedure (General Profile), Phase 2 Check 4 requires:
   > "Build and run: Build the project from source and run its test suite. The build must succeed and tests must execute — a project that doesn't build or whose tests don't run is automatically flagged."
   > "Block on failure: If ANY check fails, the verdict is INTEGRITY VIOLATION and the work product must be rejected."
2. **Empirical Fact**: Executing the project test suite `npm test` fails with code 1 due to `ak5e/scripts/inventor-features.mjs:45`.
3. **Empirical Fact**: In `ak5e/scripts/ak5e.mjs:361`, `game.ak5e.specialist` is frozen via `Object.freeze`. In `ak5e/scripts/inventor-features.mjs:45`, `registerInventorHooks()` executes `globalThis.game.ak5e.specialist.inventor = { ... }`.
4. **Inference**: In strict mode (standard for all ESM modules), assigning to a property of an `Object.freeze` object throws a `TypeError`.
5. **Impact**: Because `registerInventorHooks()` is invoked inside `Hooks.once("ready", ...)` at `ak5e.mjs:601`, any client loading the AK5e Foundry module in production or running any integration harness (such as `verify-chapter-one-helpers.mjs`) will crash during startup with an unhandled `TypeError`.
6. **Constraint Enforcement**: Per Key Constraints, the auditor is audit-only and must not modify production code to fix the issue.
7. **Conclusion**: Because Check 4 of the Integrity Forensics suite fails and the work product introduces a fatal runtime crash in the module entrypoint, the mandatory verdict is **INTEGRITY VIOLATION**.

---

## 3. Caveats

- **Isolated Subclass Logic is High Quality**: The mechanical calculations (`calculateInstability`, `evaluateBreakdownRoll`, `getItemModifications`, `calculateInventorDC`), table-play confirmation, zero-clamping, non-blocking warnings, GM relay validation, and encounter-window undo receipts are implemented with high fidelity and passed all 304 unit and adversarial tests.
- **Defect Scope**: The defect is strictly located in `ak5e/scripts/inventor-features.mjs:42–75`. Because `ak5e.mjs` already registers and freezes `game.ak5e.specialist.inventor` (lines 449–465), `registerInventorHooks()` should not attempt to overwrite `globalThis.game.ak5e.specialist.inventor` (or must check `if (globalThis.game && !Object.isFrozen(globalThis.game.ak5e?.specialist))`).
- No other files were found to have integrity violations, hardcoded test strings, facade placeholders, or fabricated verification outputs.

---

## 4. Conclusion

**Verdict: INTEGRITY VIOLATION (REJECTED)**

Milestone 4 cannot be certified as CLEAN because the project test suite (`npm test`) fails and the main module entry point (`ak5e/scripts/ak5e.mjs`) crashes on Foundry startup with:
`TypeError: Cannot assign to read only property 'inventor' of object '#<Object>'` at `ak5e/scripts/inventor-features.mjs:45:46`.

The work product must be returned to the implementer to remove or guard the mutating assignment to frozen `globalThis.game.ak5e.specialist.inventor` in `ak5e/scripts/inventor-features.mjs:42–75` so that `npm test` passes cleanly.

---

## 5. Verification Method

To independently reproduce this finding:

1. Run the project test suite:
   ```bash
   npm test
   ```
   **Expected Failure**: Exits with code 1 at `node ak5e/tools/verify-chapter-one-helpers.mjs` with `TypeError: Cannot assign to read only property 'inventor' of object '#<Object>'` at `ak5e/scripts/inventor-features.mjs:45:46`.

2. Direct reproduction:
   ```bash
   node ak5e/tools/verify-chapter-one-helpers.mjs
   ```
   **Expected Failure**: Exits with code 1 with stack trace pointing to `registerInventorHooks` in `ak5e/scripts/inventor-features.mjs:45`.

3. Invalidation Condition:
   The finding is resolved when `registerInventorHooks()` does not attempt to mutate frozen `game.ak5e.specialist`, allowing `node ak5e/tools/verify-chapter-one-helpers.mjs` and `npm test` to pass with exit code 0.
