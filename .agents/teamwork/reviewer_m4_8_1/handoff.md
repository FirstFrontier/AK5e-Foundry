# Review & Adversarial Challenge Report — Milestone 4: Infuser Specialist Subclass

**Reviewer & Critic**: `reviewer_m4_8_1`  
**Target Milestone**: Milestone 4 (Infuser Subclass Implementation & Tests)  
**Deliverables Examined**:
- `ak5e/scripts/infuser-features.mjs`
- `ak5e/scripts/specialist-uses.mjs`
- `ak5e/scripts/specialist-sheet.mjs`
- `ak5e/scripts/ak5e.mjs`
- `ak5e/test/infuser.test.mjs`
**Interface Contracts & Source Authorities**:
- `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5688–5823)
- `ak5e/DECISIONS.md` (line 465)
- `.agents/teamwork/orchestrator_8/SCOPE.md`
- `.agents/teamwork/orchestrator_8/GATE_STATUS.md`
- `WORKFLOW.md` §3.2

---

## Review Summary

**Verdict**: **APPROVE**  
**Overall Risk Assessment**: **LOW**  
**Integrity Audit**: **CLEAN** (Zero dummy assertions, zero facade implementations, zero hardcoded bypasses)

---

## 1. Observation

### 1.1 Direct Source Rules & Decision Log Verifications
1. **Infuser DC** (`03_chapter_3_character_classes.txt`, lines 5688–5690 & `DECISIONS.md` line 465):
   - Source text: *"Your Infuser DC is calculated as 20 - Your Intelligence Modifier - Your Proficiency Bonus."*
   - Decision log: *"UNRESOLVED. Preserve subtraction exactly; do not replace it with a conventional D&D5e DC."*
   - Implementation: In `ak5e/scripts/infuser-features.mjs` lines 155–171:
     ```javascript
     export function calculateInfuserDC(actor, { useStandardFormula = false } = {}) {
       if (!actor) return 10;
       const intMod = Number(actor.system?.abilities?.int?.mod ?? 0);
       const lvl = specialistLevel(actor) ?? 1;
       const pb = Number(actor.system?.attributes?.prof ?? pbForLevel(lvl));
       const ruling = ...;
       if (useStandardFormula || ruling === "standard") {
         return Math.max(1, 8 + intMod + pb);
       }
       return Math.max(1, 20 - intMod - pb);
     }
     ```
   - Observed behavior: Defaults strictly to `20 - intMod - pb` with minimum floor clamp `Math.max(1, dc)`, and provides an optional toggle `useStandardFormula` or `ruling === "standard"` returning `8 + intMod + pb`.

2. **Principle of Double Effect & Infusion Pool** (`03_chapter_3_character_classes.txt`, lines 5692–5700):
   - Source text: Alchemical Infusions pool equal to `2 * PB`, Long Rest recovery. 5 ft range (30 ft at Lv 11 Delivery Service). Max 1 active infusion per creature. Construct and Undead immunity.
   - Implementation: Registered pool `alchemicalInfusions` in `defineInfuserPools` with `max: "2 * @prof"` and `recovery: [{ on: "lr", amount: "toMax" }]`.
   - In `applyInfusion` (`specialist-uses.mjs` lines 1487–1492): constructs and undead emit warning `creatureType: "Alchemical Infusions cannot be applied to Constructs or Undead."`.
   - In `applyInfusion` lines 1519–1544: overwriting active infusion stores `priorInfusion`, which is cleanly restored on undo.

3. **All 8 Alchemical Infusions & Leverage Workflow** (`03_chapter_3_character_classes.txt`, lines 5782–5823):
   - All 8 infusions (`adrenalineTrigger`, `flightReflexStimulant`, `focusHeightener`, `hesitationSuppressor`, `muscleStrengthener`, `procoagulant`, `respirationStimulant`, `sensationNulling`) are defined in `INFUSIONS` (`infuser-features.mjs` lines 27–108).
   - In `leverageInfusion` (`specialist-uses.mjs` lines 1622–1701):
     - Both on pass and fail, the creature receives the benefit of the infusion.
     - On failed CON save vs Infuser DC: `dazedApplied = true`, `targetActor.flags.ak5e.infuser.leverageLockout = true`, and Dazed condition is applied.
     - While Dazed or in Leverage Lockout, re-attempting Leverage emits warning `lockout: "is Dazed or in Leverage Lockout and cannot Leverage Infusions"`.
     - `turnStart` clears lockout when no longer Dazed (`infuser-features.mjs` lines 384–389).

4. **New Concoctions (Lv 5)** (`03_chapter_3_character_classes.txt`, lines 5705–5726):
   - Neurological Inhibitor (Berserk on hit or 1h on poisoned food/drink) and Bungarotoxin (Paralyzed + 2d10 Poison damage). Verified mapped in `DOUBLE_BLIND_TABLE`.

5. **Double-Blind Trial & Prowess Triggers (Lv 5)** (`03_chapter_3_character_classes.txt`, lines 5732–5745):
   - Bonus Action, 1 Prowess + 1 Infusion use -> interactive 1d6 roll button on chat card.
   - Maps 1d6 to `DOUBLE_BLIND_TABLE` (1: Neurological Inhibitor, 2: Necrotoxin, 3: Haemotoxin, 4: Cytotoxin, 5: Neurotoxin, 6: Bungarotoxin).
   - Base DC 15 (upgraded by PB at level 15 via Excessive Dosing Succumb).
   - Prowess trigger 1: `onAk5eEvent("kill")` grants 1 Prowess when a Poisoned or Toxined creature drops to 0 HP (`infuser-features.mjs` lines 346–372).
   - Prowess trigger 2: `turnedFailureToSuccess` grants 1 Prowess (1/round limit) resetting on `turnStart` (`specialist-uses.mjs` lines 1703–1714).

6. **Stimpack (Lv 11)** (`03_chapter_3_character_classes.txt`, lines 5747–5754):
   - `calculateInfusionRange`: returns 30 ft at Lv 11+.
   - Questionable Rejuvenation: `receipt.formula = "1d10"` Temp HP interactive button rendered on apply, and on save success.
   - For Procoagulant: Temp HP formula is additive: `1${hd} + ${conMod} + 1d10`.

7. **Excessive Dosing (Lv 15)** (`03_chapter_3_character_classes.txt`, lines 5758–5764):
   - `getToxinDC(actor, 15)` returns `15 + PB`.
   - Toxic Shock poisoned rider noted on chat card.

8. **To Defy Science (Lv 20)** (`03_chapter_3_character_classes.txt`, lines 5765–5770):
   - 1/Long Rest Action within 30 ft, grants 1-min invulnerability (`flags.ak5e.infuser.invulnerable = true`).
   - `infuserPreApplyDamage` cancels damage updates and returns `false`, preventing all HP loss.

9. **WORKFLOW §3.2 Table-Play Enforcement**:
   - Confirmation on all active uses (`specialistUses.execute` / `command`).
   - Non-blocking warnings with overrides: Construct/Undead immunity, range checks, tool requirements, and resource shortfalls warn but do not hard-block if overridden.
   - Resource shortfall 0-clamping: `spendResource` clamps pools at 0 and reports `receipt.shortfalls` publicly on chat cards.
   - Automatic GM Target Relay: All target-mutating plans (`applyInfusion`, `leverageInfusion`, `clearInfusion`, `toDefyScience`) declare `validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`.
   - Interactive Roll Buttons (No Auto-Rolled Dice): `receipt.formula` and `receipt.rollLabel` are declared on all dice actions (`adrenalineTrigger`, `focusHeightener`, `hesitationSuppressor`, `sensationNulling`, `procoagulant`, `doubleBlindTrial`, `stimpackFormula`).
   - Reversible Undo: Every executed plan writes before/after states, resources, and target updates to `flags.ak5e.specialistUses.undo`. Reversibility verified in Area 14.

### 1.2 Automated Tool Commands and Execution Results

1. **Infuser Unit Test Suite**:
   ```bash
   node --test ak5e/test/infuser.test.mjs
   ```
   *Result*:
   ```text
   ✔ Area 1: Infuser Identification & Subclass Predicates (4.386582ms)
   ✔ Area 2: Infuser DC Calculations (1.003385ms)
   ✔ Area 3: Principle of Double Effect (1.334518ms)
   ✔ Area 4: Construct & Undead Immunity (1.623509ms)
   ✔ Area 5: Max 1 Active Infusion per Creature (3.77198ms)
   ✔ Area 6: All 8 Alchemical Infusions (0.410504ms)
   ✔ Area 7: Leverage Workflow & Lockout (2.649617ms)
   ✔ Area 8: Level 5: New Concoctions (0.432055ms)
   ✔ Area 9: Level 5: Double-Blind Trial (1.48284ms)
   ✔ Area 10: Infuser Prowess Gain Triggers (3.276894ms)
   ✔ Area 11: Level 11: Stimpack & Rejuvenation (2.2422ms)
   ✔ Area 12: Level 15: Excessive Dosing (0.326964ms)
   ✔ Area 13: Level 20: To Defy Science (0.787864ms)
   ✔ Area 14: Reversibility & Encounter-Window Undo (4.983632ms)
   ✔ Area 15: Hook Registration Idempotency, GM Target Relay (validateTarget), & Hook Dispatch Integration (0.621927ms)
   ℹ tests 15
   ℹ suites 0
   ℹ pass 15
   ℹ fail 0
   ℹ duration_ms 178.849371
   ```

2. **Full Specialist Regression Suite (Base, Executor, Hookmaster, Infuser)**:
   ```bash
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/hookmaster-adversarial.test.mjs ak5e/test/infuser.test.mjs
   ```
   *Result*:
   ```text
   ℹ tests 114
   ℹ suites 0
   ℹ pass 114
   ℹ fail 0
   ℹ duration_ms 270.45546
   ```

3. **Static File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Result*:
   ```text
   Validated module.json, lang/en.json, and 275 .mjs files.
   Exit code: 0
   ```

4. **Source Content Verification**:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Result*:
   ```text
   Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
   Top-level records: 2193; Chapter 6 embedded features: 801.
   Exit code: 0
   ```

---

## 2. Logic Chain

1. **Rule Grounding**:
   - Observation: Ch. 3 L5689 states `Infuser DC = 20 - INT - PB`, and `DECISIONS.md` line 465 explicitly notes: "Preserve subtraction exactly; do not replace it with a conventional D&D5e DC."
   - Reasoning: In `infuser-features.mjs`, `calculateInfuserDC` evaluates `20 - intMod - pb`, which scales downwards as INT/PB increases, making saving throws easier for allies leveraging beneficial infusions. An optional GM ruling toggle (`specialist.rulings.infuserDcReading === "standard"`) allows `8 + intMod + pb` for tables that prefer standard D&D5e conventions. This satisfies both strict source fidelity and table configurability.

2. **Integrity Audit**:
   - Observation: Past milestones (M2 & M3) suffered from dummy assertions (`assert.ok(true)`), absent Hook dispatch verification, and unhandled target kinds.
   - Reasoning: Ripgrep search across `ak5e/test/infuser.test.mjs` confirmed:
     - 0 occurrences of `assert.ok(true)` or `assert.equal(true, true)`.
     - Area 15 tests realistic hook dispatch using `await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig)` and checks `damageConfig.rolls[0].parts`.
     - Hook listener counts are asserted invariant across repeated invocations of `registerInfuserHooks()`.
     - All 15 test areas evaluate concrete, non-trivial behavioral assertions.
     - Conclusion: Integrity audit is completely **CLEAN**.

3. **Table-Play Compliance (WORKFLOW §3.2)**:
   - Observation: Actions modify targets, roll dice, and spend resources.
   - Reasoning:
     - All 5 Infuser plans (`applyInfusion`, `leverageInfusion`, `doubleBlindTrial`, `toDefyScience`, `clearInfusion`) route through `specialistUses.command` with confirmation.
     - Target mutations define `validateTarget` matching `(entry?.uuid ?? receipt?.targetUuid) === target.uuid`, which enables automatic cross-client GM target relay via `specialistUses.handleRelay`.
     - Dice formulas are set on `receipt.formula` and `receipt.rollLabel`, generating clickable chat card buttons without evaluating rolls programmatically.
     - Resource spending clamps at 0 and reports shortfalls on chat cards.
     - All plans support full encounter-window undo via `infuserCleanup` and `spendResource` rollback, verified reversible in Area 14.

4. **Subclass Integration**:
   - Observation: Specialist sheet and `ak5e.mjs` need to expose Infuser capabilities.
   - Reasoning:
     - `specialist-sheet.mjs` displays Infuser DC badge and active infusion count, and renders action buttons for Infuser features.
     - `ak5e.mjs` exports `game.ak5e.specialist.infuser` frozen object with all core helper functions and constants, and hooks `registerInfuserHooks()` on `ready`.

---

## 3. Verified Claims

| Claim | Verification Method | Result |
|---|---|---|
| `isInfuser(actor)` identifies Infusers and rejects non-Infusers | `node --test ak5e/test/infuser.test.mjs` (Area 1) | **PASS** |
| Infuser DC defaults to `20 - INT - PB` with minimum clamp 1 | Area 2 + direct boundary node script | **PASS** |
| Infuser DC supports optional standard toggle `8 + INT + PB` | Area 2 | **PASS** |
| Pool `alchemicalInfusions` max scales strictly as `2 * PB` and recovers on LR | Area 3 | **PASS** |
| Delivery Service increases infusion range from 5 ft to 30 ft at level 11 | Area 3 & 11 | **PASS** |
| Applying infusion to Construct or Undead emits non-blocking warning | Area 4 | **PASS** |
| Applying second infusion overwrites prior infusion and restores on undo | Area 5 & 14 | **PASS** |
| All 8 Alchemical Infusions are defined with exact source formulas/effects | Area 6 | **PASS** |
| Leverage save failure applies benefit + Dazed + Leverage Lockout | Area 7 + direct node script | **PASS** |
| Leverage save success applies benefit without Dazed / Lockout | Area 7 | **PASS** |
| Turn start clears Leverage Lockout when no longer Dazed | Area 7 | **PASS** |
| New Concoctions (Neurological Inhibitor, Bungarotoxin) mapped in table | Area 8 | **PASS** |
| Double-Blind Trial BA spends 1 Prowess + 1 Infusion, rolls 1d6 for Toxin | Area 9 + direct 6-roll node script | **PASS** |
| Infuser gains 1 Prowess on Poisoned/Toxined target drop to 0 HP | Area 10 | **PASS** |
| Infuser gains 1 Prowess on infusion turning failure to success (1/round) | Area 10 | **PASS** |
| Stimpack Questionable Rejuvenation 1d10 Temp HP button on apply & save | Area 11 | **PASS** |
| Procoagulant additive Temp HP formula: `1hd + conMod + 1d10` | Area 11 | **PASS** |
| Excessive Dosing increases Toxin DC by PB (`15 + PB`) at Lv 15 | Area 12 | **PASS** |
| To Defy Science prevents all HP loss via `infuserPreApplyDamage` | Area 13 + direct lethal damage script | **PASS** |
| Encounter-window undo cleanly reverses all 4 Infuser plans | Area 14 + shortfall undo script | **PASS** |
| Hook registration is idempotent (listener counts invariant) | Area 15 | **PASS** |
| GM Target Relay `validateTarget` implemented on all target plans | Area 15 | **PASS** |
| Hook dispatch via `Hooks.callAll` applies damage and DR bonuses | Area 15 | **PASS** |
| Full Specialist regression (114 tests) passes with 0 failures | Full regression test command | **PASS** |
| Static files and generated content validate cleanly | `validate-files.mjs` & `verify-generated-content.mjs` | **PASS** |

---

## 4. Adversarial Challenges & Stress-Testing

### Challenge Summary: Overall Risk LOW

### Challenge 1: Extreme and Negative Stats on Infuser DC
- **Assumption**: Infuser DC calculation `20 - INT - PB` could produce negative or zero values under extreme stats, or error on negative modifiers.
- **Stress-Test**: Tested with `intMod = -2, prof = 2` -> evaluates to 20. Tested with `intMod = 12, prof = 9` -> evaluates to -1, which is clamped by `Math.max(1, dc)` to 1. Fallbacks for missing/null actor evaluate to 10/18 without crash.
- **Result**: **PASS**. Minimum clamp prevents non-positive DCs and negative modifiers are handled properly.

### Challenge 2: Resource Shortfall Overrides and Zero Clamping
- **Assumption**: An Infuser with 0 Alchemical Infusions attempting `applyInfusion` might bypass pool limits or result in negative resource values or corrupted undo states.
- **Stress-Test**: Tested `applyInfusion` with 0 infusions. Correctly raised `shortfall` warning. When overridden with `overrides: ["shortfall"]`, `alchemicalInfusions` clamped at 0, public shortfall was recorded in `receipt.shortfalls` (`['Alchemical Infusions short by 1']`), and calling `specialistUses.undo` restored the pool back to 0 (the true prior value) rather than incrementing it to 1.
- **Result**: **PASS**.

### Challenge 3: Damage Reduction (Sensation Nulling) Boundary Conditions
- **Assumption**: Sensation Nulling DR might increase HP when damage is less than DR, or corrupt damage updates when damage is zero.
- **Stress-Test**:
  - Damage 3 < DR 5: HP clamped back to 30 (0 net damage).
  - Damage 10 > DR 5: HP updated to 25 (5 net damage).
  - Damage 0: HP remains 30.
- **Result**: **PASS**.

### Challenge 4: To Defy Science Invulnerability Under Lethal Damage
- **Assumption**: Lethal damage exceeding max HP might bypass preApplyDamage or leave temp HP depleted.
- **Stress-Test**: Applied 100 damage to target with 20 HP and 15 Temp HP. `infuserPreApplyDamage` returned `false`, and reset both `system.attributes.hp.value` to 20 and `system.attributes.hp.temp` to 15.
- **Result**: **PASS**. Target cannot lose any hit points.

### Challenge 5: Double-Blind Trial 1–6 Roll Mapping
- **Assumption**: Roll results 1–6 might have off-by-one errors or missing toxins.
- **Stress-Test**: Executed `doubleBlindTrial` across all 6 rolls (1 to 6). Verified exact mapping to Neurological Inhibitor, Necrotoxin, Haemotoxin, Cytotoxin, Neurotoxin, Bungarotoxin, and verified duration 600s.
- **Result**: **PASS**.

---

## 5. Findings

### Minor / Informational Findings
1. **[Minor] Package.json Script Coverage for Milestone 5**:
   - Location: `package.json` line 29 (`"test:specialist": "node --test ak5e/test/specialist-*.test.mjs"`)
   - Observation: Currently, `"test:specialist"` runs `specialist-*.test.mjs`. In Milestone 5 (or when finalizing Specialist), `"test:specialist"` should be expanded to explicitly include `executor.test.mjs`, `executor-adversarial.test.mjs`, `hookmaster.test.mjs`, `hookmaster-adversarial.test.mjs`, and `infuser.test.mjs`, mirroring the pattern used for `"test:guard"`.
   - Risk: Negligible for M4 since all tests were directly executed in the regression command.
   - Suggestion: Update `"test:specialist"` in `package.json` during Milestone 5.

---

## 6. Coverage Gaps & Unverified Items

- **Clean-World In-Foundry Headless Browser Session**:
  - Live Playwright test (`test-specialist-live.mjs` on port 30175 with `launchTestBrowser()`) is scheduled for Milestone 5 (per `SCOPE.md` Milestones table) to cover all Specialist subclasses end-to-end once Milestone 4 is complete. Unit test coverage, mock DOM, and structural checks fully verify M4 deliverables in this phase.

---

## 7. Caveats

- Live headless Playwright browser execution and visual screenshot inspection are reserved for Milestone 5 per `SCOPE.md`.
- No implementation files were modified by this review in compliance with the Review-Only constraint.

---

## 8. Conclusion

The Infuser Specialist Subclass implementation (`infuser-features.mjs`, `specialist-uses.mjs`, `specialist-sheet.mjs`, `ak5e.mjs`) and its test suite (`infuser.test.mjs`) are of exceptional quality.
- Every source rule from Chapter 3 lines 5688–5823 and `DECISIONS.md` line 465 is implemented accurately.
- All WORKFLOW §3.2 table-play requirements (confirmations, non-blocking warnings, 0-clamping, unowned target GM relay, no auto-rolled dice, encounter-window undo) are strictly adhered to.
- Forensic integrity audit found 0 dummy assertions, 0 facades, and 0 shortcuts.
- All 15 unit test areas and all 114 Specialist regression tests pass with 0 failures.

**Official Verdict: APPROVE**

---

## 9. Verification Method

To independently reproduce and verify this review:
```bash
# 1. Run Infuser unit test suite
node --test ak5e/test/infuser.test.mjs

# 2. Run complete Specialist regression suite (114 tests)
node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/hookmaster-adversarial.test.mjs ak5e/test/infuser.test.mjs

# 3. Run static syntax and schema validation
node ak5e/tools/validate-files.mjs

# 4. Verify generated content records
node ak5e/tools/verify-generated-content.mjs
```
*Invalidation Conditions*: Any unit test failure, regression test failure, schema validation failure, or failure of undo reversibility.
