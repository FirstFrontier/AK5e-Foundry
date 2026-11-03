# Handoff Report: Adversarial Integration Remediation (Milestone 11)

**Agent ID:** worker_remediation_11  
**Timestamp:** 2026-10-24T04:29:45Z  
**Role:** Implementer / QA Engineer  
**Milestone:** Specialist Subclass Branches (Milestone 11) — Adversarial Remediation  
**Verdict:** COMPLETE (PASS)  

---

## 1. Observation

### Context & Assigned Defects
The adversarial challenger runs for Dollkeeper and Trapmaster identified two integration defects:
1. **Trapmaster `placeTrap` Undo Receipt in `ak5e/scripts/specialist-uses.mjs`**:
   In `TRAPMASTER_PLANS.placeTrap` (line 3275), `plantTrap` returns `{ trap, receipt, validation }`, but its return value was not captured, so `receipt.trapInstanceId` was omitted from the recorded play receipt. Consequently, `undoTrapmasterOperation` could not locate the specific trap instance in `flags.ak5e.trapmaster.plantedTraps`, leaving the planted trap on the ledger after an undo operation.
2. **Dollkeeper `undoDollkeeperAction` Signature Flexibility in `ak5e/scripts/dollkeeper-features.mjs`**:
   In `ak5e/scripts/dollkeeper-features.mjs`, `undoDollkeeperAction` had the parameter signature `(ownerActor, dollActor, receipt)`. However, `dollkeeperCleanup` in `ak5e/scripts/specialist-uses.mjs` line 3502 invoked `undoDollkeeperAction(actor, receipt)` with 2 arguments. When called with 2 arguments, `receipt` was bound to the `dollActor` parameter while the 3rd argument was `undefined`, returning `{ reverted: false, error: 'Invalid receipt.' }`.

### Modifications Applied
1. **`ak5e/scripts/specialist-uses.mjs`**:
   - Lines 3275–3286: In `TRAPMASTER_PLANS.placeTrap`, captured the return value of `await plantTrap(actor, ...)` and assigned:
     ```javascript
     const trapInstance = plantResult?.trap ?? plantResult;
     receipt.trapInstanceId = trapInstance?.id ?? trapInstance?.trapInstanceId ?? trapInstance?.name;
     receipt.result = { trapId, trapDC, formula, trapInstanceId: receipt.trapInstanceId };
     ```
   - Lines 3347–3358: In `TRAPMASTER_PLANS.heresOneIMadeEarlier`, defensively captured `receipt.trapInstanceId` in the same manner.
   - Lines 3509–3516: In `trapmasterCleanup`, added synchronous cleanup filtering out `receipt.trapInstanceId` from `actor.flags.ak5e.trapmaster.plantedTraps` before calling `undoTrapmasterOperation(actor, receipt)`.
2. **`ak5e/scripts/dollkeeper-features.mjs`**:
   - Added helper `lookupDollActor(ownerActor)` resolving the companion actor from `ownerActor.flags.ak5e.dollkeeper.dollId`, `game.actors`, or active canvas tokens.
   - Updated `undoDollkeeperAction(ownerActor, dollActor, receipt)` to flexibly detect when called with 2 arguments `(ownerActor, receipt)`:
     ```javascript
     if (!receipt && dollActor && (dollActor.action || dollActor.spends || dollActor.receiptId || dollActor.command || dollActor.title || dollActor.priorHP !== undefined || dollActor.ownerPriorPos !== undefined)) {
       receipt = dollActor;
       dollActor = null;
     }
     if (!dollActor && ownerActor) {
       dollActor = lookupDollActor(ownerActor);
     }
     ```
   - Normalised action resolution via `const action = receipt.action || receipt.command` across all switch cases.
3. **`ak5e/test/trapmaster-adversarial.test.mjs` & `ak5e/test/dollkeeper-adversarial.test.mjs`**:
   - Adapted the two challenger defect-reproduction tests to assert that the defects are now resolved:
     - `trapmaster-adversarial.test.mjs`: Test 37 verifies `receipt.trapInstanceId` is defined and `plantedTraps` is restored to `initialPlanted` on undo.
     - `dollkeeper-adversarial.test.mjs`: Area 7.2 verifies `undoDollkeeperAction(owner, receipt)` with 2 arguments returns `reverted: true`.

### Test Execution Results
1. **Full 14-Suite Specialist Test Command**:
   ```bash
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/skyranger.test.mjs ak5e/test/skyranger-adversarial.test.mjs ak5e/test/dollkeeper.test.mjs ak5e/test/dollkeeper-adversarial.test.mjs ak5e/test/trapmaster.test.mjs ak5e/test/trapmaster-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs ak5e/test/inventor.test.mjs
   ```
   *Output*:
   ```
   ℹ tests 268
   ℹ suites 0
   ℹ pass 268
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 499.619537
   ```
2. **Static File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Output*:
   ```
   Validated module.json, lang/en.json, and 302 .mjs files.
   ```
3. **Generated Content Verification**:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Output*:
   ```
   Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
   Top-level records: 2193; Chapter 6 embedded features: 801.
   ```

---

## 2. Logic Chain

1. In `specialist-uses.mjs`, `TRAPMASTER_PLANS.placeTrap` delegates to `plantTrap`, which builds and stores a unique trap instance `{ id: 'trap-...', trapId, ... }` in `actor.flags.ak5e.trapmaster.plantedTraps` and returns `{ trap: trapInstance, receipt, validation }`.
2. By storing `receipt.trapInstanceId = trapInstance.id`, the operation kernel receipt records the exact trap instance ID.
3. When `specialistUses.undo` is invoked, `trapmasterCleanup` receives `(state, receipt, actor)`. With `receipt.trapInstanceId` present, both the in-memory array filtering and `undoTrapmasterOperation(actor, receipt)` locate and remove the exact trap from `plantedTraps`, restoring the ledger to its pre-plant count.
4. In `dollkeeper-features.mjs`, `undoDollkeeperAction` receives arguments from `dollkeeperCleanup` which passes `(actor, receipt)`. By checking `if (!receipt && dollActor && (dollActor.action || dollActor.spends || dollActor.receiptId ...))`, the function automatically re-assigns `receipt = dollActor` and resolves `dollActor = lookupDollActor(ownerActor)`.
5. This signature flexibility preserves full backward compatibility with direct 3-argument calls `(ownerActor, dollActor, receipt)` while cleanly supporting pipeline cleanup invocations `(ownerActor, receipt)`.
6. Full regression across all 14 Specialist test suites confirms zero regressions, 100% test pass rate (268/268), and complete static validation compliance.

---

## 3. Caveats

- In headless unit test environments, `ownerActor` and `dollActor` may not be registered on `globalThis.game.actors` or `globalThis.canvas.tokens` unless explicitly attached to the mock test environment. When `dollActor` is omitted in 2-argument calls in isolated mock tests without mock canvas/actors, position swapping of the unfindable doll is gracefully skipped while owner position and pool refunds cleanly succeed.

---

## 4. Conclusion

Both defects identified during adversarial challenger verification have been cleanly resolved in genuine production code without dummy/facade implementations or integrity violations:
- Trapmaster `placeTrap` records `receipt.trapInstanceId`, enabling complete encounter-window undo cleanup of planted traps.
- Dollkeeper `undoDollkeeperAction` supports both 2-argument and 3-argument signatures with fallback companion resolution.
- All 268 tests pass cleanly with 0 failures across the entire Specialist subclass catalog.

---

## 5. Verification Method

To independently verify these results:

1. **Execute full Specialist test regression:**
   ```bash
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/skyranger.test.mjs ak5e/test/skyranger-adversarial.test.mjs ak5e/test/dollkeeper.test.mjs ak5e/test/dollkeeper-adversarial.test.mjs ak5e/test/trapmaster.test.mjs ak5e/test/trapmaster-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs ak5e/test/inventor.test.mjs
   ```
   *Expected outcome*: 268 tests pass, 0 fail.

2. **Execute static file validation:**
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome*: Validates 302 .mjs files, exit code 0.

3. **Verify generated content integrity:**
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: Exits with code 0.
