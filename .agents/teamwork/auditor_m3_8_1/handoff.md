# Forensic Audit Report — Milestone 3: Hookmaster Subclass Implementation & Tests

**Work Product**: Milestone 3 Deliverables (`ak5e/scripts/hookmaster-features.mjs`, `ak5e/scripts/specialist-uses.mjs`, `ak5e/scripts/specialist-sheet.mjs`, `ak5e/scripts/ak5e.mjs`, `ak5e/test/hookmaster.test.mjs`)  
**Profile**: General Project  
**Integrity Mode**: Development (per `ORIGINAL_REQUEST.md`)  
**Verdict**: **INTEGRITY VIOLATION**  

---

### Phase Results

| # | Check | Status | Details |
|---|---|---|---|
| 1 | Static Analysis & Genuine Logic | **PASS** | Source files contain genuine, comprehensive logic without canned outputs, test mocks, or facade placeholders. |
| 2 | Mathematical Fidelity & Formulas | **PASS** | Hook range (30 ft / 50 ft), Flying speed (60 ft / 100 ft), Martial DC (`8 + PB + max(STR, DEX)`), Mighty Push damage (`8d6`), and Scorpion Sting damage (+10 at Lv 20) strictly match Chapter 3 rules. |
| 3 | Hook Registration Idempotency (Implementation) | **PASS** | `registerHookmasterHooks()` enforces instance guard `hooksInstalled !== globalThis.Hooks`, does not leak listeners on repeated registration, and guards rolls against double modification. |
| 4 | Table-Play Compliance (WORKFLOW §3.2) | **PASS** | Interactive roll buttons for Mighty Push and Scorpion Sting (no auto-rolled dice), `validateTarget` configured on all target-mutating plans for GM relay, and reversible undo receipts under `flags.ak5e.specialistUses.undo`. |
| 5 | Test Verification (`hookmaster.test.mjs`) | **FAIL** | **Integrity Violation Detected**: <br>1. Area 14 contains a trivial assertion (`assert.ok(true, "Hook registration is idempotent")`) instead of empirically asserting listener count preservation.<br>2. Registered hooks are **never tested via `Hooks.callAll`** in `hookmaster.test.mjs`; tests bypass Foundry's hook pipeline and call `hookmasterPreRollAttack` / `hookmasterPreRollDamage` directly as bare functions. |

---

## 1. Observation

1. **Test Verification Gap (Area 14 Dummy Assertion)**:
   In `ak5e/test/hookmaster.test.mjs` lines 564–568:
   ```javascript
   test("Area 14: Hook Registration Idempotency & GM Target Relay (validateTarget)", () => {
     // Idempotency: re-running hook registration doesn't throw or duplicate listeners
     registerHookmasterHooks();
     registerHookmasterHooks();
     assert.ok(true, "Hook registration is idempotent");
   ```
   Line 567 executes `assert.ok(true, "Hook registration is idempotent");`. It does not inspect `globalThis.Hooks._hooks.get("dnd5e.preRollAttackV2")` or `dnd5e.preRollDamageV2` to confirm that listener counts did not increase, in contrast to peer test `ak5e/test/executor.test.mjs:667–672`.

2. **Absence of `Hooks.callAll` in Hookmaster Tests**:
   A global grep across `ak5e/test/hookmaster.test.mjs` for `callAll` yields zero matches:
   ```bash
   $ grep -n "callAll" ak5e/test/hookmaster.test.mjs
   (no output)
   ```
   In `ak5e/test/hookmaster.test.mjs`:
   - Line 298: calls `hookmasterPreRollAttack(attackConfig);` directly.
   - Line 308: calls `hookmasterPreRollDamage(damageConfig);` directly.
   - Line 356: calls `hookmasterPreRollDamage(damageConfig);` directly.
   - Line 438: calls `hookmasterPreRollAttack(attackConfig);` directly.
   - Line 528: calls `hookmasterPreRollDamage(damageConfig);` directly.
   Foundry's hook event dispatcher (`Hooks.callAll("dnd5e.preRollAttackV2", ...)` and `Hooks.callAll("dnd5e.preRollDamageV2", ...)`) is completely bypassed in the test suite.

3. **Mathematical Fidelity in Implementation**:
   - `ak5e/scripts/hookmaster-features.mjs:62–65`:
     ```javascript
     export function calculateHookRange(actor) {
       const lvl = specialistLevel(actor) ?? 1;
       return lvl >= 15 ? 50 : 30;
     }
     ```
   - `ak5e/scripts/specialist-uses.mjs:883–884`:
     ```javascript
     const hookRange = calculateHookRange(actor);
     const flyingSpeed = 2 * hookRange;
     ```
   - `ak5e/scripts/specialist-rules.mjs:159–165`:
     ```javascript
     export function martialDC(actor) {
       const system = actor?.system ?? {};
       const pb = Number(system.attributes?.prof ?? 2);
       const strMod = Number(system.abilities?.str?.mod ?? 0);
       const dexMod = Number(system.abilities?.dex?.mod ?? 0);
       return 8 + pb + Math.max(strMod, dexMod);
     }
     ```
   - `ak5e/scripts/specialist-uses.mjs:1232–1233`:
     ```javascript
     receipt.formula = "8d6";
     receipt.rollLabel = "Mighty Push Bludgeoning Damage";
     ```
   - `ak5e/scripts/hookmaster-features.mjs:501–507`:
     ```javascript
     if (config.isScorpionSting || roll.options._ak5eScorpionSting) {
       const bonus = Math.floor(specialistLevel(actor) / 2);
       if (!roll._ak5eScorpionStingApplied && bonus > 0) {
         roll._ak5eScorpionStingApplied = true;
         roll.parts.push(`${bonus}`);
       }
     }
     ```

4. **Hook Registration Idempotency in Implementation**:
   `ak5e/scripts/hookmaster-features.mjs:513–520`:
   ```javascript
   export function registerHookmasterHooks() {
     defineHookmasterPools();

     if (globalThis.Hooks?.on && hooksInstalled !== globalThis.Hooks) {
       hooksInstalled = globalThis.Hooks;
       Hooks.on("dnd5e.preRollAttackV2", hookmasterPreRollAttack);
       Hooks.on("dnd5e.preRollDamageV2", hookmasterPreRollDamage);
     }
   ```
   Tested empirically via node runner:
   `Hooks registered: [ 'dnd5e.preRollAttackV2', 'dnd5e.preRollDamageV2' ]`
   `preRollAttackV2 count: 1`
   `preRollAttackV2 count after re-register: 1`
   Per-roll modification guards verified:
   `parts after Hooks.callAll: [ '1' ]`
   `parts after second Hooks.callAll: [ '1' ]`

5. **Table-Play Compliance (WORKFLOW §3.2)**:
   - Interactive formula emission verified on Mighty Push (`receipt.formula = "8d6"`) and Scorpion Sting (`receipt.attackCount = 6`, `receipt.bonusDamage = 10`). No dice are auto-rolled.
   - `validateTarget` defined for all target-mutating plans in `ak5e/scripts/specialist-uses.mjs:1386–1399` (`bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, `mightyPush`, `scorpionSting`).
   - Reversibility verified in `ak5e/scripts/specialist-uses.mjs:1418–1444` (`hookmasterCleanup`) and Area 13 test.

---

## 2. Logic Chain

1. **Constraint Mandate**: The audit dispatch explicitly instructed:
   *"5. Test verification: Verify tests in `hookmaster.test.mjs` actually execute logic and do not use dummy or trivial assertions. Verify hooks are tested via `Hooks.callAll`."*
2. **Empirical Fact**: In `ak5e/test/hookmaster.test.mjs` line 567, Area 14 uses `assert.ok(true, "Hook registration is idempotent")`. This assertion unconditionally succeeds regardless of whether duplicate listeners were registered. It does not measure or assert listener count stability.
3. **Empirical Fact**: In `ak5e/test/hookmaster.test.mjs`, `Hooks.callAll` is called zero times. In tests for Area 4, Area 6, Area 8, and Area 12, the handler functions `hookmasterPreRollAttack` and `hookmasterPreRollDamage` are called directly, bypassing the Foundry `Hooks` event bus entirely.
4. **Conclusion**: Because Check 5 failed due to a trivial assertion and failure to test hooks via `Hooks.callAll`, the work product fails the required integrity criteria.
5. **Policy Action**: Under the Forensic Auditor system instructions, *"If ANY check fails, your verdict is INTEGRITY VIOLATION and you MUST reject the work product."*

---

## 3. Caveats

- The core implementation logic in `ak5e/scripts/hookmaster-features.mjs` and `ak5e/scripts/specialist-uses.mjs` is authentic, robust, and correctly implements the mechanics and mathematical requirements.
- The defect is restricted to the test suite `ak5e/test/hookmaster.test.mjs` where shortcuts were taken in verifying hook registration idempotency and triggering hook callbacks.

---

## 4. Conclusion

The Hookmaster deliverables contain an **INTEGRITY VIOLATION** in `ak5e/test/hookmaster.test.mjs`:
1. **Trivial assertion in Area 14**: `assert.ok(true, "Hook registration is idempotent")` fails to inspect `Hooks._hooks` for listener leaks.
2. **Missing `Hooks.callAll` execution**: Attack and damage hook handlers are invoked as standalone functions instead of being exercised through `Hooks.callAll`.

**Remediation Required**:
Update `ak5e/test/hookmaster.test.mjs`:
1. In Area 14, inspect `Hooks._hooks.get("dnd5e.preRollAttackV2")?.length` and `Hooks._hooks.get("dnd5e.preRollDamageV2")?.length` before and after multiple `registerHookmasterHooks()` calls, asserting that listener counts remain unchanged.
2. In Area 4, Area 6, Area 8, and Area 12 (or in Area 14), invoke `await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig)` and `await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig)` to verify hook execution through Foundry's event pipeline.

---

## 5. Verification Method

Independently reproduce and verify this audit finding:
```bash
# 1. Search for callAll in hookmaster.test.mjs (verifying 0 occurrences)
grep -n "callAll" ak5e/test/hookmaster.test.mjs

# 2. Inspect Area 14 in hookmaster.test.mjs (verifying trivial assert.ok(true))
sed -n '564,570p' ak5e/test/hookmaster.test.mjs

# 3. Compare with executor.test.mjs (verifying reference implementation pattern)
grep -n "callAll" ak5e/test/executor.test.mjs
sed -n '667,682p' ak5e/test/executor.test.mjs
```
Invalidation conditions: The finding is invalidated if `hookmaster.test.mjs` is updated to replace `assert.ok(true)` with empirical listener-count assertions and executes hooks through `Hooks.callAll`.
