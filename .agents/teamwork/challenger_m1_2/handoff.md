# Handoff Report: Milestone 1 Test Harness Adversarial Challenge

## 1. Observation

### 1.1 Test Runner Scripts in `package.json`
Inspected `/home/patch/AK5e-Foundry/package.json` lines 27–32:
```json
27:     "test:vanguard": "node --test ak5e/test/vanguard-*.test.mjs ak5e/test/tip-of-the-spear.test.mjs ak5e/test/standard-bearer.test.mjs",
28:     "test:supporter": "node --test ak5e/test/supporter-*.test.mjs",
29:     "test:specialist": "node --test ak5e/test/specialist-*.test.mjs",
30:     "test:medic": "node --test ak5e/test/medic-*.test.mjs",
31:     "test:base-classes": "npm run test:vanguard && npm run test:supporter && npm run test:specialist && npm run test:medic",
32:     "test": "npm run check:files && npm run check:generated && npm run test:content && npm run test:parsers && npm run test:rules && npm run test:installers && npm run test:origins && npm run test:deployment && npm run test:caster && npm run test:defender && npm run test:guard && npm run test:marksman && npm run test:base-classes"
```

### 1.2 Passing Execution & Exit Codes
Executed each script under baseline passing conditions:
- `npm run test:vanguard` -> exited with code `0`. Output: `ℹ tests 37 ℹ suites 0 ℹ pass 37 ℹ fail 0`.
- `npm run test:supporter` -> exited with code `0`. Output: `ℹ tests 0 ℹ suites 0 ℹ pass 0 ℹ fail 0` (clean placeholder awaiting M3 test files).
- `npm run test:specialist` -> exited with code `0`. Output: `ℹ tests 0 ℹ suites 0 ℹ pass 0 ℹ fail 0` (clean placeholder awaiting M4 test files).
- `npm run test:medic` -> exited with code `0`. Output: `ℹ tests 0 ℹ suites 0 ℹ pass 0 ℹ fail 0` (clean placeholder awaiting M5 test files).
- `npm run test:base-classes` -> sequentially ran all 4 scripts; exited with code `0`.

### 1.3 Adversarial Failure Injection & Exit Code Propagation
Empirically probed each runner entrypoint with injected failure modes and observed exit code propagation:

1. **Assertion Failure Propagation across Class Scripts and Combined Runner:**
   - Injected probe in `ak5e/test/vanguard-probe-fail.test.mjs` (`assert.equal(1, 2)`):
     - `npm run test:vanguard` exited with code `1`.
     - `npm run test:base-classes` exited with code `1`.
   - Injected probe in `ak5e/test/supporter-probe-fail.test.mjs` (`assert.equal(1, 2)`):
     - `npm run test:supporter` exited with code `1`.
     - `npm run test:base-classes` exited with code `1`.
   - Injected probe in `ak5e/test/specialist-probe-fail.test.mjs` (`assert.equal(1, 2)`):
     - `npm run test:specialist` exited with code `1`.
     - `npm run test:base-classes` exited with code `1`.
   - Injected probe in `ak5e/test/medic-probe-fail.test.mjs` (`assert.equal(1, 2)`):
     - `npm run test:medic` exited with code `1`.
     - `npm run test:base-classes` exited with code `1`.

2. **Syntax Errors, Top-Level Throws, and Asynchronous Rejections:**
   - Injected invalid syntax in `ak5e/test/vanguard-probe-syntax.test.mjs`:
     - `npm run test:vanguard` exited with code `1`; `npm run test:base-classes` exited with code `1`.
   - Injected top-level `throw new Error("Top level crash")` in `ak5e/test/supporter-probe-throw.test.mjs`:
     - `npm run test:supporter` exited with code `1`; `npm run test:base-classes` exited with code `1`.
   - Injected unhandled `Promise.reject(new Error("unhandled asynchronous rejection"))` in `ak5e/test/medic-probe-unhandled.test.mjs`:
     - `npm run test:medic` exited with code `1`; `npm run test:base-classes` exited with code `1`.

3. **Global `npm test` Failure Propagation:**
   - Injected probe failure in `ak5e/test/specialist-probe-fail.test.mjs`:
     - Root `npm test` exited with code `1`, halting immediately upon reaching `test:base-classes`.

All probe files were verified cleanly deleted after each test.

### 1.4 `TEST_INFRA.md` Edge Case Coverage vs Survey Reports
Cross-referenced `TEST_INFRA.md` against survey reports (`spec_miner_survey_rules/handoff.md:466–483`, `explorer_survey_engine/handoff.md:63–83`, `explorer_survey_tests/handoff.md:144–224`):
- **Zero-spend clamp & public shortfall card:**
  - `TEST_INFRA.md:16`: "Resource pools clamp at zero on manual override and broadcast shortfall text publicly on chat cards."
  - `TEST_INFRA.md:49`: "Resource Depletion & Shortfalls: Spends with 0 available resources; manual 'Use anyway' overrides clamping exactly at 0; public chat card shortfall badges."
  - Verified across all class checklists (`TEST_INFRA.md:166, 179, 191, 207`).
- **Construct healing warning:**
  - `TEST_INFRA.md:51`: "Invalid Targets & Creature Types: Invalid targets (e.g. Constructs attempting to receive healing from features lacking construct exceptions)."
  - `TEST_INFRA.md:199`: "Touch Heal (Lv 1): Action spend X Life Support to restore X missing HP (1:1 conversion); Construct warning."
- **Revivify / Resuscitation & To Rob the Ferryman:**
  - `TEST_INFRA.md:203`: "Resuscitation (Lv 12): 1/Long Rest free Revivify cast."
  - `TEST_INFRA.md:204`: "To Rob the Ferryman (Lv 18): Revivify restores 3 * Medic Level HP."
- **Tip of the Spear Additive THP (#2):**
  - `TEST_INFRA.md:58`: "Vanguard: Landstrider Nimble condition + Tip of the Spear additive THP across multiple turns."
  - `TEST_INFRA.md:158`: "Tip of the Spear (Lv 1): 1d6 roll table applied to visible ally within 60 ft; cumulative; #2 additive THP."
- **Lighten the Load (no chaining):**
  - `TEST_INFRA.md:59`: "Lighten the Load reaction chaining"
  - `TEST_INFRA.md:174`: "Lighten the Load (Lv 11): Reaction on ally rolling Aid Die: grant free Aid Die to another ally without expending pool."
- **Mark of a Specialist (refund on repeated failure):**
  - `TEST_INFRA.md:185`: "Show Your Style & Prowess (Lv 2): prowess pool (max = PB, +1 on SR/LR); Mark of a Specialist check reroll with refund on repeated failure."
- **Falling Upwards (Reaction before roll):**
  - `TEST_INFRA.md:188`: "Falling Upwards / It's All Skill (Lv 17): Reaction before saving throw roll: spend 3 Prowess to auto-succeed."
- **Medic Life Support overMax & Step Table (20 to 170):**
  - `TEST_INFRA.md:43`: "20–170 step table for Medic Life Support"
  - `TEST_INFRA.md:198`: "Life Support pool: step table 20 to 170, overMax: true permitted, Long Rest recovery."
- **Medic Armor Restriction:**
  - `TEST_INFRA.md:194`: "Chassis: ... Light Shields ONLY, Light Melee Weapons, 1 Tool Kit/Vehicle."
- **Medic Touch Heal, Preserver, Urgency of Treatment:**
  - `TEST_INFRA.md:61, 199, 200, 201`: 1:1 conversion, 5 Life Support reroll, 10:1 AP discount.
- **Strict Progression Idempotency:**
  - `TEST_INFRA.md:19, 53, 165, 178, 190, 206`: Idempotent level 1–20 feature setup with deterministic `contextKey` hashing.

---

## 2. Logic Chain

1. **Test Runner Correctness (Observation 1.1 & 1.2):**
   - Each script in `package.json` correctly invokes Node's native test runner (`node --test`) targeting its respective test files.
   - Under passing conditions, all 5 scripts exit cleanly with code `0`.
   - The empty glob patterns for Supporter, Specialist, and Medic gracefully report 0 tests with exit code `0` while awaiting milestone implementation.
2. **Failure Propagation Integrity (Observation 1.3):**
   - Injected assertion failures in any class test suite cause both the individual npm script and the combined `test:base-classes` script to exit with code `1`.
   - Because `test:base-classes` chains individual runners with `&&`, any failure immediately stops execution and returns the non-zero exit code.
   - Syntax errors, top-level exceptions, and unhandled promise rejections are not swallowed or suppressed; Node's test runner traps each condition and exits with code `1`.
   - Root `npm test` includes `npm run test:base-classes` and propagates failure exit codes without masking.
3. **Specification & Edge Case Completeness (Observation 1.4):**
   - `TEST_INFRA.md` addresses all architectural principles from `WORKFLOW.md §3.2` (no auto-rolled dice, confirm before use, clamp at 0 on override, automatic GM relay for unowned targets, encounter-window undo).
   - Every edge case identified in the survey reports (`spec_miner_survey_rules`, `explorer_survey_engine`, `explorer_survey_tests`) is represented across the 4-tier methodology and Section 5 class checklists.
4. **Overall Assessment:**
   - The test track infrastructure, test runner scripts, and `TEST_INFRA.md` are robust, reliable, and free of defects.

---

## 3. Caveats

- **Test Suite Files in M3–M5:** Currently, `supporter-*.test.mjs`, `specialist-*.test.mjs`, and `medic-*.test.mjs` do not yet have test files because those classes are scheduled for Milestones 3, 4, and 5. This is expected milestone sequencing; our empirical failure probes proved that as soon as test files are created, any failures will propagate exit code 1 immediately.
- **Hardware Acceleration in Live Browser:** In headless environments, Playwright uses Mesa EGL per `ak5e/tools/test-browser.mjs`. Live browser execution is scheduled for Milestone 6.

---

## 4. Conclusion

**Verdict: APPROVE**

- All test script entrypoints in `package.json` (`test:vanguard`, `test:supporter`, `test:specialist`, `test:medic`, `test:base-classes`) function correctly.
- Exit codes under passing conditions are strictly `0`.
- Failure exit codes under all tested failure modes (assertion failure, syntax error, top-level throw, unhandled promise rejection) are reliably propagated with exit code `1` across individual scripts, `test:base-classes`, and root `npm test`.
- `TEST_INFRA.md` comprehensively covers all edge cases from survey reports (zero-spend clamp, construct healing warning, Revivify/Resuscitation, additive THP, non-chaining Lighten the Load, Prowess refunds, pre-roll reactions, and Life Support overMax).
- No blocking issues or defects found.

---

## 5. Verification Method

To independently reproduce and verify this empirical challenge:

1. **Verify Passing Exit Codes:**
   ```bash
   npm run test:vanguard && npm run test:supporter && npm run test:specialist && npm run test:medic && npm run test:base-classes
   echo "Exit code: $?"
   ```
   *Expected:* Exit code `0`.

2. **Verify Failure Propagation via Injection Probe:**
   ```bash
   node -e '
   import { writeFileSync, unlinkSync } from "node:fs";
   import { spawnSync } from "node:child_process";

   const probe = "ak5e/test/medic-fail-probe.test.mjs";
   writeFileSync(probe, "import test from \"node:test\"; import assert from \"node:assert/strict\"; test(\"fail\", () => assert.fail(\"boom\"));\n");
   const r1 = spawnSync("npm", ["run", "test:medic"], { encoding: "utf8" });
   const r2 = spawnSync("npm", ["run", "test:base-classes"], { encoding: "utf8" });
   unlinkSync(probe);

   if (r1.status === 1 && r2.status === 1) console.log("FAILURE PROPAGATION EMPIRICALLY CONFIRMED (exit code 1)");
   else { console.error("PROPAGATION FAILED", r1.status, r2.status); process.exit(1); }
   '
   ```
   *Expected:* Prints `FAILURE PROPAGATION EMPIRICALLY CONFIRMED (exit code 1)` with exit code `0`.

3. **Verify Static File & Content Rules:**
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected:* All pass with exit code `0`.
