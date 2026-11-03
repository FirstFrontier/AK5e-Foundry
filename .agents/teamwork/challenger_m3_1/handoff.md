# Adversarial Verification Report: Milestone 3 (Supporter Base Class)

**Agent**: `challenger_m3_1`  
**Role**: `critic`, `specialist` (code-executing empirical challenger)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_1/`  
**Recipient**: `e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6` (orchestrator)  
**Verdict**: **APPROVE**  

---

## 1. Observation

Direct empirical observations from test suites and stress harnesses authored and executed on the live environment:

1. **Supporter Adversarial Test Suite Execution**:
   - Command: `node --test ak5e/test/supporter-adversarial.test.mjs`
   - Exit Code: `0`
   - Verbatim Output:
     ```text
     ✔ ADV-AID-1: Provide Aid grants 10-minute effect with correct die size and metadata (5.82275ms)
     ✔ ADV-AID-2: Single Aid Die per creature rule and override behavior (2.57058ms)
     ✔ ADV-AID-3: Range boundary check (60 ft exact vs 61 ft out-of-range) (1.446748ms)
     ✔ ADV-AID-4: Pool exhaustion, shortfall warning, and zero-clamping override (1.721001ms)
     ✔ ADV-AID-5: Mental ability modifier minimum bounds (negative/zero mental mods) (0.354275ms)
     ✔ ADV-ADV-1: Pre-level 5 Supporter does not trigger Advanced Aid riders (0.648757ms)
     ✔ ADV-ADV-2: All five Advanced Aid riders resolve correctly at Level 5+ (1.878742ms)
     ✔ ADV-ADV-3: Invalid roll type and Death Saving Throw rejections (0.463614ms)
     ✔ ADV-LTL-1: Level requirement check (Lv 10 throws level warning) (0.601417ms)
     ✔ ADV-LTL-2: Reaction depletion, override, and self/same target boundaries (1.829698ms)
     ✔ ADV-LTL-3: Grants free supplementary die even when Supporter pool is empty (0.862454ms)
     ✔ ADV-ER-1: Short Rest recovery rounds up and clamps at pool max (0.869508ms)
     ✔ ADV-ER-2: Turn start 0-recovery triggers only when empty (0.674746ms)
     ✔ ADV-SS-1: Turn start grants and consumes personal die at Level 18+ (0.384473ms)
     ✔ ADV-WIB-1: Will Into Being bonus (+PB) at Level 20 vs Level 19 (0.680086ms)
     ✔ ADV-UNDO-1: Full multi-step operations and undo reversibility across table play (3.140647ms)
     ℹ tests 16
     ℹ suites 0
     ℹ pass 16
     ℹ fail 0
     ℹ duration_ms 170.793374
     ```

2. **Supporter Progression Adversarial Stress Harness**:
   - Command: `node ak5e/tools/stress-supporter-progression.mjs`
   - Exit Code: `0`
   - Verbatim Output:
     ```text
     Starting Adversarial Stress Harness for Supporter...
     [PASS] Setup Idempotency: 5 sequential runs do not increase item count
     [PASS] Setup Idempotency: Pre-populated authored item is preserved
     [PASS] Progression: Incremental level-up 1 -> 20
     [PASS] Progression Idempotency: Re-run at level 20 does not double-count HP or ASIs
     [PASS] Progression Invariant: Tampered contextKey is rejected
     [PASS] Progression Invariant: Saves validation (exactly 2 from CON, CHA, WIS)
     [PASS] Progression Invariant: Skills validation (exactly 3 from 6 supporter skills)
     [PASS] Progression Invariant: Starting equipment cash grants exactly 1300 LMD once
     [PASS] Progression Invariant: ASI scheme validation (+2 or +1/+1 scheme, ability cap 20)

     === SUMMARY OF ADVERSARIAL STRESS HARNESS ===
     Passed: 9/9, Failed: 0/9
     ```

3. **Combined Supporter Test Suite Execution**:
   - Command: `npm run test:supporter`
   - Exit Code: `0`
   - Output summary: 44 tests passed (28 worker tests + 16 adversarial tests), 0 failures across 185.66ms duration.

4. **Static Validation**:
   - Command: `node ak5e/tools/validate-files.mjs`
   - Exit Code: `0`
   - Output: `Validated module.json, lang/en.json, and 241 .mjs files.`

5. **Base Classes Test Suite Execution**:
   - Command: `npm run test:base-classes`
   - Exit Code: `0`
   - Output summary: 118 tests passed across Vanguard (74) and Supporter (44), 0 failures.

6. **Full Module Test Suite Execution**:
   - Command: `npm test`
   - Exit Code: `0`
   - Output summary: 100% of test suites passed across all submodules with 0 failures.

---

## 2. Logic Chain

1. **Provide Aid & Resource Pool Resilience (`ADV-AID-1` to `ADV-AID-5`)**:
   - Observation 1.1 proves Provide Aid enforces 60-ft range (`ADV-AID-3`), single Aid Die per creature restriction (`ADV-AID-2`), and 10-minute (600s) duration effect creation on target actors (`ADV-AID-1`).
   - When the Aid Die pool is empty, attempts to Provide Aid throw a non-blocking `shortfall` warning. Overriding with `overrides: ["shortfall"]` permits execution, zero-clamps the pool value without allowing negative values, and logs the public shortfall notice (`ADV-AID-4`).
   - Characters with negative mental modifiers are guaranteed a pool floor of 1 via `max(1, ...)` (`ADV-AID-5`).

2. **Advanced Aid Riders (`ADV-ADV-1` to `ADV-ADV-3`)**:
   - Observation 1.1 proves that before level 5, `useAidDie` yields `advancedEffect: null` (`ADV-ADV-1`).
   - At level 5+, all five source riders resolve based on roll type: attack (crit range +1), skill (roll second die and choose), save (temp HP = roll + PB), damage (10 ft splash Force damage = roll), and healing (temp HP = roll) (`ADV-ADV-2`).
   - Invalid roll types throw `invalidRollType` warning, and death saves throw `deathSave` warning adhering to source L6635 ("except Death Saving Throws") (`ADV-ADV-3`).

3. **Lighten the Load Mechanics (`ADV-LTL-1` to `ADV-LTL-3`)**:
   - Observation 1.1 proves Lighten the Load enforces Supporter level 11 (`ADV-LTL-1`), verifies reaction availability (`ADV-LTL-2`), forbids self-targeting (`selfTarget`), forbids targeting the triggering ally (`sameTarget`), enforces 60-ft range, and blocks supplementary die chaining (`chaining`).
   - Crucially, granting a supplementary die consumes no pool dice and functions correctly even when the Supporter's Aid Die pool is at 0 (`ADV-LTL-3`).

4. **Ever Reliable & Self-Supportive Recovery (`ADV-ER-1`, `ADV-ER-2`, `ADV-SS-1`)**:
   - Ever Reliable Short Rest recovery accurately restores `Math.ceil(max / 2)` dice, correctly rounding up for odd maximums (e.g. 5 max -> 3 recovered) and clamping at maximum (`ADV-ER-1`).
   - Turn start 0-recovery triggers only when the pool is at 0, granting exactly 1 die, and does not over-grant if dice remain (`ADV-ER-2`).
   - Level 18 Self-Supportive sets `flags.ak5e.supporter.selfSupportDie: true` at turn start, resetting cleanly on consumption (`ADV-SS-1`). Characters below level 18 do not trigger this hook.

5. **Will Into Being Capstone (`ADV-WIB-1`)**:
   - At level 20, PB is +6, and `willBonus` adds +6 to Aid Die rolls (`ADV-WIB-1`). At level 19, bonus is 0.

6. **Undo Reversibility (`ADV-UNDO-1`)**:
   - Multi-step operations (`provideAid`, `lightenTheLoad`, `useAidDie`) generate encounter receipts. Executing `undo` cleanly reverts resource expenditures, restores reactions, and removes active effect documents from recipient actors.

7. **Progression and Setup Invariants (`stress-supporter-progression.mjs`)**:
   - Observation 1.2 proves 5 sequential setup runs produce zero additional creates (`Setup Idempotency`).
   - Pre-existing authored items and customizations are strictly preserved.
   - Incremental level-up 1 -> 20 validates all choices and maintains idempotency without double-counting HP or ASIs.
   - Saves validation rejects invalid options, duplicate choices, or incorrect choice counts.
   - Skills validation rejects non-class skills, duplicates, or counts != 3.
   - Starting equipment cash mode awards 1300 LMD once and remains idempotent.

---

## 3. Caveats

- In-Foundry rendered Chromium sheet interactions and GM relay verification are delegated to the dedicated validator task (`foundry_validator_m5`), while this adversarial verification focused on empirical execution of rules, engine state, active effects, receipts, progression invariants, and unit test suites.
- No other caveats; all empirical stress tests executed cleanly with zero failures.

---

## 4. Conclusion

The Supporter Base Class (Milestone 3) implementation is mechanically complete, robust, source-faithful to AK5e Chapter 3 rules, and compliant with WORKFLOW.md §3.2 table-play philosophy.

All adversarial challenge scenarios (pool exhaustion, zero clamping, range boundaries, single-die constraints, Advanced Aid riders, Lighten the Load reaction & chaining guards, Ever Reliable recovery rounding, Self-Supportive personal die, Will Into Being bonus, and undo reversibility) passed 100% of checks.

**VERDICT: APPROVE**

---

## 5. Verification Method

To independently verify this report:

```bash
# 1. Run supporter adversarial test suite (16 tests)
node --test ak5e/test/supporter-adversarial.test.mjs

# 2. Run supporter progression stress harness (9 tests)
node ak5e/tools/stress-supporter-progression.mjs

# 3. Run all supporter tests (44 tests)
npm run test:supporter

# 4. Run file validation
node ak5e/tools/validate-files.mjs

# 5. Run all base classes tests (118 tests)
npm run test:base-classes

# 6. Run full module test suite
npm test
```

Invalidation conditions:
- Any test failure in `ak5e/test/supporter-adversarial.test.mjs` or `ak5e/tools/stress-supporter-progression.mjs`.
- Failure in `npm run test:supporter` or `npm test`.
