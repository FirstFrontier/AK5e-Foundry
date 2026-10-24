# Adversarial Challenge Report: Medic Progression Idempotency, Schema Stress & Concurrency

## Verdict
**REQUEST_CHANGES**

Critical defects were empirically reproduced in `ak5e/scripts/medic-progression.mjs` regarding progression idempotency, choice schema validation, and starting equipment item resolution.

---

## 1. Observation

### 1.1 Test Execution Commands & Outputs
Two independent test harnesses were authored and executed:

1. **Standalone Stress Harness**:
   ```bash
   node ak5e/tools/stress-medic-progression.mjs
   ```
   **Output**:
   ```
   Starting Adversarial Stress Harness for Medic Progression, Schema Edge Cases & Concurrency...

   [PASS] Progression Idempotency: Level 1 -> 4 -> 8 -> 12 -> 16 -> 20 incremental progression (7.90ms)
   [FAIL] Progression Idempotency: Re-run progression 5 times on same Level 20 character (HP, ASIs, items) (2.45ms): Run 2: STR must not re-apply (expected 12, got 14)
   [PASS] Progression Idempotency: Authored item changes (names, descriptions, flags) preserved on re-run (1.96ms)
   [FAIL] Choice Schema: Attempting to pick 1 or 3 saves must reject (exactly 2 required) (0.25ms): 1 save must be flagged as pending or error (exactly 2 required)
   [FAIL] Choice Schema: Attempting to pick invalid saves (STR, DEX, CHA) must reject (0.20ms): Invalid saves (STR, DEX) must be flagged as pending/error
   [FAIL] Choice Schema: Attempting invalid skills must reject (Medicine auto + exactly 2 from allowed) (0.23ms): Unlisted skills must be flagged as pending/error
   [FAIL] Choice Schema: Attempting Feats for ASIs must reject (only ability improvements allowed) (0.27ms): Feats for ASI must be rejected/flagged as pending (AK5e allows only ability score improvements)
   [FAIL] Choice Schema: Starting equipment cash (1300 LMD) vs item packages idempotency (1.19ms): Medical Kit tool was granted as part of starting equipment package
   [PASS] Concurrency Stress: 10 simultaneous touchHeal calls serialized via keyedSerial (7.89ms)
   [PASS] Concurrency Stress: Interleaved spends and undos maintain consistent state (1.01ms)

   === SUMMARY OF ADVERSARIAL STRESS HARNESS ===
   Passed: 4/10, Failed: 6/10
   Total execution time: 23.35ms
   ```

2. **Integration Test Suite**:
   ```bash
   node --test ak5e/test/medic-challenger-progression.test.mjs
   ```
   **Output**:
   ```
   ✔ Challenger 1: Progression incremental level-up 1 -> 20 does not duplicate cash or features (9.956504ms)
   ✖ Challenger 2: Progression re-run on Level 20 character must not re-apply ASIs to non-maxed abilities (3.714991ms)
   ✔ Challenger 3: Authored item customizations are preserved across progression re-runs (1.411494ms)
   ✖ Challenger 4: Choice Schema - Saves must require exactly 2 choices from CON, INT, WIS (0.629522ms)
   ✖ Challenger 5: Choice Schema - Skills must require exactly 2 choices from allowed Medic list (0.479075ms)
   ✖ Challenger 6: Choice Schema - ASI must reject Feats and invalid increase schemes (0.427015ms)
   ✖ Challenger 7: Starting equipment grants Medical Kit tool with valid chapter 4 ID (0.895189ms)
   ✔ Challenger 8: Concurrency - 10 simultaneous touchHeal calls serialized via keyedSerial (8.73896ms)
   ✔ Challenger 9: Concurrency - Interleaved spends and undos maintain exact pool consistency (1.318076ms)
   ℹ tests 9 | pass 4 | fail 5
   ```

### 1.2 Direct Code Observations in `ak5e/scripts/medic-progression.mjs`

- **Defect 1: ASI Re-application on Progression Re-Run**:
  - In `ak5e/scripts/medic-progression.mjs` lines 521–529:
    ```js
    await actor.update({
      [`flags.ak5e.${MEDIC_PROGRESS_FLAG}`]: {
        ...state,
        choices: plan.choices,
        hpLevels: updatedHpLevels,
        asiLevels: updatedAsiLevels,
        startingEquipmentGranted: state.startingEquipmentGranted || Boolean(plan.choices.startingEquipment?.mode)
      }
    });
    ```
    The raw `plan.choices` (including `{ increases: [...] }`) is persisted in `state.choices`. Granted ASI levels are never marked `{ mode: "existing" }`.
  - In `medicChoices` lines 170–177:
    ```js
    const level = levelOf(medicClass(actor));
    if (level) {
      result.asi ??= {};
      result.hp ??= {};
      for (const n of ASI_LEVELS.filter(v => v <= level)) result.asi[n] ??= { mode: "existing" };
      for (let n = 1; n <= level; n++) result.hp[n] ??= { mode: "existing" };
    }
    ```
    Because `result` clones `saved`, `result.asi[n]` already exists with `{ increases: [...] }`, so `result.asi[n] ??= { mode: "existing" }` does nothing.
  - In `previewMedicProgression` lines 446–462:
    ```js
    const abilityIncreases = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    for (const n of ASI_LEVELS.filter(v => v <= level)) {
      const asiChoice = choices.asi?.[n];
      if (asiChoice?.increases) {
        for (const inc of asiChoice.increases) {
          abilityIncreases[inc.ability] += inc.amount;
        }
      }
    }
    for (const [abl, inc] of Object.entries(abilityIncreases)) {
      if (inc > 0) {
        const current = currentAbility(actor, abl);
        writes[`system.abilities.${abl}.value`] = Math.min(20, current + inc);
      }
    }
    ```
    Unlike `vanguard-progression.mjs` and `supporter-progression.mjs`, it does NOT check `!state.asiLevels.includes(n)`, nor does it check `asiChoice.mode !== "existing"`. On re-run, it adds `inc` to `currentAbility(actor, abl)` repeatedly.
  - Verbatim verification:
    ```
    STR after run 1: 12
    STR after run 2 (empty choices): 14
    STR after run 3 (empty choices): 16
    ```

- **Defect 2: Complete Absence of `pending` Schema Validation**:
  - In `previewMedicProgression` lines 384–386:
    ```js
    const writes = {};
    const createItems = [];
    const kept = [];
    ```
    There is no `pending = []` array tracking invalid or missing choices.
  - In `applyMedicProgression` lines 501–507:
    ```js
    export async function applyMedicProgression(actor, { confirmed, contextKey, choices = {} } = {}) {
      need(confirmed === true, "Confirm the previewed Medic progression first.");
      const plan = await previewMedicProgression(actor, choices);
      need(
        plan.contextKey === contextKey,
        "The character changed since the preview; preview the Medic progression again."
      );
    ```
    There is no `need(plan.pending.length === 0, ...)` check.

- **Defect 3: Saving Throw Schema Validation Omitted**:
  - Lines 419–425:
    ```js
    // Saves (2 choices from con, int, wis)
    const currentSaves = new Set(system.traits?.saves?.value ?? []);
    for (const s of (choices.saves ?? [])) {
      if (["con", "int", "wis"].includes(s)) currentSaves.add(s);
    }
    writes["system.traits.saves.value"] = Array.from(currentSaves);
    ```
    It accepts 0, 1, 3, or duplicate saves without error, and silently filters out unlisted saves (e.g. STR, DEX, CHA) without rejecting or flagging pending.

- **Defect 4: Skill Schema Validation Omitted**:
  - Lines 438–444:
    ```js
    // Skills: Medicine is automatic with Expertise (value = 2, Medical Expertise Ch. 3 L4658)
    writes["system.skills.med.value"] = 2;
    for (const skillKey of (choices.skills ?? [])) {
      if (skillKey !== "med") {
        writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
      }
    }
    ```
    Any skills passed in `choices.skills` (e.g. Athletics, Stealth, or 10 skills) are written directly into `system.skills` without checking against `MEDIC_SKILL_CHOICES` or validating that exactly 2 choices are made.

- **Defect 5: ASI Schema Validation Omitted (Feats / Invalid Increases)**:
  - Lines 446–462:
    Does not validate that increases adhere to `+2` or `+1/+1` schemes, does not reject duplicate abilities in `+1/+1`, and does not reject Feat objects.

- **Defect 6: Invalid Medical Kit Item ID in Starting Equipment**:
  - Line 408:
    ```js
    const kitEntry = EQUIPMENT.find(e => e.id === "tool-medical-kit-5");
    ```
  - In `ak5e/scripts/chapter-four-content.mjs`:
    `"tool-medical-kit-5"` does NOT exist (item `tool-maintenance-kit-5` is Maintenance Kit).
    The actual ID for Medical Kit is `"tool-medical-kit-8"`.
    Because `kitEntry` is `undefined`, the Medical Kit is NEVER created when choosing starting equipment items.

---

## 2. Logic Chain

1. *Premise 1*: AK5e 1.3.1 Chapter 3 (L4582–4593) mandates:
   - Hit Dice 1d6; 6+CON HP; Light Shields only; Light Melee; 1 Tool Kit; exactly 2 saving throws from CON, INT, WIS; Medicine skill expertise + exactly 2 skills from Lore, Arts, Tech, Insight, Perception, Persuasion; ASIs allow only ability score improvements (no feats).
2. *Premise 2*: Progression idempotency (WORKFLOW §3.2, GEMINI §3, PROJECT.md R1) mandates that re-running progression produces identical state without duplicate feature grants, loss of hit points, or repeating HP / ASI increments.
3. *Observation 1 (ASI Idempotency)*: `previewMedicProgression` computes `writes["system.abilities." + abl + ".value"] = Math.min(20, currentAbility(actor, abl) + inc)` without verifying whether that level's ASI was already granted (`state.asiLevels.includes(n)`), and `applyMedicProgression` does not mark granted ASIs as `{ mode: "existing" }`.
   *Inference 1*: Re-running progression on any actor with an ability score under 20 continuously increments that ability score (+2 on each run) until it reaches 20. This is a severe idempotency violation.
4. *Observation 2 (Schema Enforcement)*: `previewMedicProgression` lacks a `pending` array, and `applyMedicProgression` lacks `need(plan.pending.length === 0, ...)`. Invalid inputs (1 or 3 saves, STR/DEX saves, unlisted skills, Feats for ASIs) are silently accepted or written directly to the actor.
   *Inference 2*: The choice schema is unconstrained; malformed or illegal player choices are not rejected.
5. *Observation 3 (Equipment Catalog)*: `tool-medical-kit-5` does not exist in `chapter-four-content.mjs`; Medical Kit is `tool-medical-kit-8`.
   *Inference 3*: Starting equipment creation silently omits the Medical Kit.
6. *Observation 4 (Concurrency)*: 10 simultaneous calls to `medicUses.command("touchHeal")` were executed concurrently on the same actor.
   *Inference 4*: `keyedSerial` in `play-uses.mjs` serialized all 10 calls strictly. 50 LS was deducted, 50 HP was restored, and 10 ordered undo receipts were recorded. Concurrency serialization is working correctly.

---

## 3. Caveats
- No changes were made to production implementation code, strictly adhering to the Challenger/Reviewer role constraints.
- Concurrency testing verified single-client execution through `keyedSerial`; multi-client websocket race conditions depend on Foundry server socket routing.
- Subclasses Therapist and Ward were not tested as they are out of scope for Milestone M5.

---

## 4. Conclusion
While the base chassis calculations, feature setup, and table-play concurrency serialization via `keyedSerial` are solid, the Medic progression module has significant defects:
1. **ASI Re-Application**: Non-maxed ability scores increment on every progression re-run.
2. **Missing Choice Validation**: Invalid saves, invalid skills, invalid ASI schemes, and Feats are not rejected.
3. **Broken Tool Kit Grant**: Medical Kit is never granted due to a typo in the equipment ID (`tool-medical-kit-5` instead of `tool-medical-kit-8`).

**Required Fixes for the Implementer**:
1. Align `medic-progression.mjs` with the established pattern in `vanguard-progression.mjs` and `supporter-progression.mjs`:
   - Add a `pending = []` array to `previewMedicProgression`.
   - Validate saves: `chosenSaves.length === 2 && uniqueSaves.size === 2 && chosenSaves.every(s => ["con", "int", "wis"].includes(s))`. If invalid, `pending.push("saves")`.
   - Validate skills: `uniqueSkills.size === 2 && chosenSkills.every(s => allowedSkills.includes(s))`. If invalid, `pending.push("skills")`.
   - Validate starting equipment mode. If items mode, validate `weapon1` and `shieldFocus`.
   - Fix Medical Kit ID to `"tool-medical-kit-8"`.
   - Validate ASI schemes: only `+2` or `+1/+1` to valid abilities (reject feats and duplicate abilities in `+1/+1`).
   - In `previewMedicProgression`, skip ASI increase if `state.asiLevels?.includes(n)` or if `asiChoice.mode === "existing"`.
   - In `applyMedicProgression`, enforce `need(plan.pending.length === 0, ...)`.
   - In `applyMedicProgression`, update `state.choices.asi[n] = { mode: "existing" }` for all granted levels so subsequent re-runs do not re-apply increases.

---

## 5. Verification Method

To independently reproduce all findings and verify the fixes:

1. **Execute Standalone Stress Harness**:
   ```bash
   node ak5e/tools/stress-medic-progression.mjs
   ```
   *Expected outcome prior to fixes*: 4 PASS, 6 FAIL (duration ~23ms).
   *Expected outcome after fixes*: 10 PASS, 0 FAIL.

2. **Execute Challenger Integration Test Suite**:
   ```bash
   node --test ak5e/test/medic-challenger-progression.test.mjs
   ```
   *Expected outcome prior to fixes*: 4 PASS, 5 FAIL.
   *Expected outcome after fixes*: 9 PASS, 0 FAIL.

3. **Verify File and Source Integrity**:
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: Zero syntax or schema errors, 2193 verified records.
