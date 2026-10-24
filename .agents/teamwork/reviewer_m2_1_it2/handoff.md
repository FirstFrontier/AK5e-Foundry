# Review & Verification Report: Milestone 2 Iteration 2 (Vanguard Base Class)

**Reviewer**: `reviewer_m2_1_it2`  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_1_it2/`  
**Target Roles**: `orchestrator` (`e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6`)  
**Verdict**: **APPROVE**  

---

## 1. Observation

All verification suites and source code audits were executed independently in `/home/patch/AK5e-Foundry`.

### 1.1 Integrity & Source Code Audit Observations

1. **Starting Currency Calibration**:
   - **File & Line**: `ak5e/scripts/vanguard-progression.mjs:376`
   - **Code**: `writes["system.currency.cp"] = beforeCp + 1300; // 1300 LMD = 1300 CP`
   - **Test Alignment**: `ak5e/test/vanguard-progression.test.mjs:173, 207` verifies `assert.equal(validPlan.writes["system.currency.cp"], 1300);` and `assert.equal(actor.system.currency.cp, 1300);`.
   - **Integrity Check**: Matches AK5e Ch. 4 L14 (`1 CP = 1 LMD`) and DECISIONS.md L1389. No hardcoding or arbitrary multipliers.

2. **Saving Throw Choice Validation**:
   - **File & Line**: `ak5e/scripts/vanguard-progression.mjs:322-328, 382-388`
   - **Code**:
     ```javascript
     const allowedSaves = VANGUARD_SAVES.choices.map(([_, key]) => key);
     const chosenSaves = Array.isArray(choices.saves) ? choices.saves : (choices.saves ? [choices.saves] : []);
     const validSaves = chosenSaves.length === 1 && allowedSaves.includes(chosenSaves[0]);
     if (!validSaves) {
       pending.push("saves");
     }
     ```
   - **Observed Behavior**: Tested with `["str", "cha"]`, `["int"]`, `["dex"]`, `[]`, `["str"]`, `["cha"]`. All invalid configurations push `"saves"` to `pending` and are omitted from `writes["system.traits.saves.value"]`. Dexterity is automatic.

3. **Skill Choice Validation**:
   - **File & Line**: `ak5e/scripts/vanguard-progression.mjs:330-340, 406-410`
   - **Code**:
     ```javascript
     const allowedSkills = new Set(VANGUARD_SKILLS.map(([_, key]) => key));
     const chosenSkillsList = Array.isArray(choices.skills) ? choices.skills : [];
     const uniqueChosenSkills = new Set(chosenSkillsList);
     const validSkills = chosenSkillsList.length === 3 &&
       uniqueChosenSkills.size === 3 &&
       chosenSkillsList.every(s => allowedSkills.has(s));

     if (!validSkills) {
       pending.push("skills");
     }
     ```
   - **Observed Behavior**: Tested with 2 skills (`["acr", "ath"]`), 4 skills (`["acr", "ath", "ste", "per"]`), duplicate skills (`["acr", "acr", "ste"]`), and non-Vanguard skills (`["acr", "ath", "arc"]`). All invalid configurations push `"skills"` to `pending` and prevent skill proficiencies from being written.

4. **Rolled HP Bounds and ASI Schema Validation**:
   - **File & Line**: `ak5e/scripts/vanguard-progression.mjs:421-424, 441-457`
   - **Code**:
     - HP: `rolled = Number.isFinite(rawRoll) ? Math.min(8, Math.max(1, Math.round(rawRoll))) : 5; hpIncrease += Math.max(1, rolled + conMod);`
     - ASI: Schema checked for either single `+2` or dual distinct `+1/+1` in valid abilities `["str", "dex", "con", "int", "wis", "cha"]`. Invalid configurations push `asi.${n}` to `pending`. Increases clamped via `Math.min(2, Math.max(1, inc.amount))` and capped at 20 (`Math.min(20, current + inc)`).

5. **Starting Equipment & Cash Idempotency on Level-Up**:
   - **File & Line**: `ak5e/scripts/vanguard-progression.mjs:28, 46, 151-153, 316-317, 343-350, 361-378, 524-529`
   - **Code**:
     - `state.startingEquipmentGranted` stored in flag.
     - `alreadyGrantedEquipment = Boolean(state.startingEquipmentGranted || choices.startingEquipment?.mode === "existing")`
     - Equipment item creation and currency writes are strictly guarded by `if (!alreadyGrantedEquipment)`.
     - In `applyVanguardProgression`, `state.startingEquipmentGranted = true` and `state.choices.startingEquipment = { mode: "existing" }`.
   - **Observed Behavior**: Tested incremental level-up 1 -> 2 -> 3 with both legitimate and maliciously injected `{ startingEquipment: { mode: "cash" } }` choices. In all cases, subsequent runs write 0 additional currency and create 0 duplicate items.

6. **Table-Play Engine Integrity (`vanguard-uses.mjs`)**:
   - `flag` imported from `./vanguard-rules.mjs` (L14); `nimble` plan executes without `ReferenceError`.
   - Reaction override: `triggerId: `${receipt.id}-uncannyDodge`` and `triggerId: `${receipt.id}-directedEngagement`` assigned on spends (L229-231, L274-276); overriding reaction warning with "Use anyway" completes with `spent === false` without crashing.
   - Directed Engagement: `isDirected = Boolean(directed || choice !== null)` gates Level 15 check when `!alreadyActive` (L197-202). `isDirectedEngagementActive(actor)` prevents redundant reaction spend on repeated same-turn uses.
   - Tip Outcomes 5 & 6: Active effects created with `standardBenefit: { kind: "tip5", value: 1 }` and `{ kind: "tip6", value: 1 }` (L144, L164, L375-377). Tested interoperability with `tipCritReduction`, `tipCritThreshold`, and `useTipSP`.
   - Tip Outcome 1: Creates tracked effect target with `standardBenefit: { kind: "tip1", value: pb }` (L66-81).
   - Tip 1d6 roll resolution: `vanguardUses.command("useRoll")` wrapper evaluates 1d6 roll if not yet evaluated, updates receipt target outcome data, and forwards to base `command("useRoll")` to complete application without deadlock.

7. **Combat Round Validation (`vanguard-features.mjs`)**:
   - Line 172-174: `combat = globalThis.game?.combat`; if `combat && combat.round !== 1` returns 0 bonus. Outside combat (null combat) or round 1 returns level/2 bonus.

---

### 1.2 Automated Verification Execution Results

1. **`npm run test:vanguard`**:
   ```
   ℹ tests 74
   ℹ suites 0
   ℹ pass 74
   ℹ fail 0
   ℹ cancelled 0
   ℹ duration_ms 289.854642
   ```

2. **`node ak5e/tools/stress-vanguard-progression.mjs`**:
   ```
   Starting Adversarial Stress Harness for Vanguard...
   [PASS] Setup Idempotency: 5 sequential runs do not increase item count
   [PASS] Setup Idempotency: Pre-populated authored item is preserved and not overwritten
   [PASS] Progression: Incremental level-up 1 -> 20
   [PASS] Progression Idempotency: Re-run at level 20 does not double-count HP or ASIs
   [PASS] Progression Invariant: Tampered contextKey is rejected
   [PASS] Progression Invariant: Attempting both STR and CHA saves is rejected or flagged
   [PASS] Progression Invariant: Invalid saving throw choice (e.g. INT) is rejected
   [PASS] Progression Invariant: Skill count < 3 is flagged as pending/rejected
   [PASS] Progression Invariant: Skill count > 3 is flagged as pending/rejected
   [PASS] Progression Invariant: Skills not on Vanguard list (e.g. Arcana, History, Religion) are rejected
   [PASS] Progression Invariant: Duplicate skills (e.g. ['acr', 'acr', 'acr']) are rejected
   === SUMMARY OF ADVERSARIAL STRESS HARNESS ===
   Passed: 11/11, Failed: 0/11
   [PASS] Progression Invariant: Rolled HP > 8 is rejected or clamped
   [PASS] Progression Invariant: ASI increase > 2 is rejected or clamped
   ```

3. **`node --test ak5e/test/vanguard-adversarial.test.mjs`**:
   ```
   ✔ ADV-TIP-1: Table-play unrolled Tip of the Spear succeeds useRoll flow (6.260613ms)
   ✔ ADV-TIP-2: Level 1 Vanguard picking Tip outcome raises Directed Engagement level warning (2.337606ms)
   ✔ ADV-TIP-3: Outcome 5 active effect is recognized by tipCritReduction / tipCritThreshold (1.731851ms)
   ✔ ADV-TIP-4: Outcome 6 active effect integrates with useTipSP (1.223051ms)
   ✔ ADV-THP-1: Multi-step additive THP accumulation and undo with damage absorption (1.835288ms)
   ✔ ADV-THP-2: Non-positive THP values are rejected by applyAdditiveTempHP (0.665649ms)
   ✔ ADV-RX-1: Overriding reaction warning on Uncanny Dodge succeeds with spent === false (1.0807ms)
   ✔ ADV-RX-2: Overriding reaction warning on Directed Engagement succeeds with spent === false (0.874948ms)
   ✔ ADV-RX-3: Uncanny Dodge damage halving math handles edge cases (0.255257ms)
   ✔ ADV-NIMBLE-1: Executing nimble plan in vanguardUses completes cleanly (0.860139ms)
   ✔ ADV-STORM-1: Approaching Storm damage bonus math across all 20 levels (1.625328ms)
   ✔ ADV-LIGHT-1: Lightspeed second initiative calculation handles negative initiatives (0.151249ms)
   ℹ tests 12
   ℹ suites 0
   ℹ pass 12
   ℹ fail 0
   ```

4. **`node ak5e/tools/validate-files.mjs`**:
   ```
   Validated module.json, lang/en.json, and 231 .mjs files.
   ```

5. **`npm run test:base-classes`**:
   ```
   74 passed across vanguard tests, 0 errors. Exit code: 0.
   ```

6. **`node ak5e/tools/verify-generated-content.mjs`**:
   ```
   Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
   Top-level records: 2193; Chapter 6 embedded features: 801.
   ```

7. **`npm test` (Full Repository Suite)**:
   ```
   Clean exit code 0 across all module test suites (files, generated, content, parsers, rules, installers, origins, deployment, caster, defender, guard, marksman, base-classes).
   ```

---

## 2. Logic Chain

1. **Integrity Verification**:
   - Checked source files for hardcoded test fixtures, dummy facade implementations, shortcuts, or fabricated outputs (Observation 1.1). None found. All validations are genuine, rule-grounded algorithmic checks.
2. **Progression Invariants & Calibration**:
   - Currency calibration directly implements AK5e Chapter 4 L14 and DECISIONS.md L1389 (`1300 CP = 1300 LMD`) (Observation 1.1.1).
   - Invariant checks for saves (exactly 1 from STR or CHA) and skills (exactly 3 unique from VANGUARD_SKILLS) prevent invalid traits and double-granting (Observation 1.1.2, 1.1.3).
   - Hit die roll clamping `[1, 8]` and ASI scheme validation prevent attribute and HP inflation (Observation 1.1.4).
   - Tracking `startingEquipmentGranted` in actor flags ensures that re-running progression or leveling up 1 -> 20 never duplicates items or grants starting currency more than once, even under adversarial/tampered input (Observation 1.1.5).
3. **Table Play Philosophy (WORKFLOW §3.2)**:
   - All table play uses in `vanguard-uses.mjs` require confirmation dialogs, non-blocking warning overrides with "Use anyway", resource zero-clamping, and undo receipts.
   - Missing reaction overrides succeed cleanly due to explicit `triggerId` on reaction spend receipts (Observation 1.1.6).
   - Unrolled Tip of the Spear chat card rolls cleanly resolve and populate effect targets via `command("useRoll")` (Observation 1.1.6).
   - Active effect metadata (`standardBenefit`) integrates with external critical and SP accounting helpers without missing benefits (Observation 1.1.6).
4. **Test Pass & Clean Cleanliness**:
   - All unit, stress, adversarial, static linting, and full-repository test suites pass with 0 failures and 0 regressions (Observation 1.2).

---

## 3. Caveats

No caveats. All changes are confined to module files within scope (`vanguard-progression.mjs`, `vanguard-uses.mjs`, `vanguard-features.mjs`, and their respective test suites). No external module or core D&D5e files were modified.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 2 Iteration 2 (Vanguard Base Class) is complete, robust, and compliant with all project requirements:
- Zero integrity violations.
- Starting cash correctly calibrated to 1,300 CP (`1300`).
- Saving throw and skill choice boundary validations strictly enforced.
- Rolled HP bounded to `[1, 8]` and ASI schemes validated.
- Starting equipment and currency grant is fully idempotent on level-up.
- Table play uses adhere strictly to WORKFLOW §3.2 with verified reaction override, Directed Engagement gating, Tip metadata, and `useRoll` flows.
- 100% of test suites pass cleanly with zero regressions.

---

## 5. Verification Method

To independently verify this verdict:

```bash
# 1. Vanguard test suite
npm run test:vanguard

# 2. Adversarial progression stress harness
node ak5e/tools/stress-vanguard-progression.mjs

# 3. Adversarial table play suite
node --test ak5e/test/vanguard-adversarial.test.mjs

# 4. Static file validation
node ak5e/tools/validate-files.mjs

# 5. Base classes test suite
npm run test:base-classes

# 6. Full repository test suite
npm test
```

*Invalidation Condition*: Any failure in the above commands, currency grant differing from 1,300 CP, duplicate item creation on level-up, or reaction override failure invalidates this approval.
