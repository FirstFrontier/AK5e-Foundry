# Handoff Report: Milestone 2 — Vanguard Base Class Adversarial Verification

**Agent**: `challenger_m2_2`  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m2_2_o4/`  
**Verdict**: **REQUEST_CHANGES**  

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

Empirical stress testing of `ak5e/scripts/vanguard-setup.mjs` and `ak5e/scripts/vanguard-progression.mjs` confirmed that while feature setup idempotency, incremental level transitions, level 20 re-run HP/ASI double-counting protection, and `contextKey` hash tampering rejection function correctly, the progression engine (`previewVanguardProgression` / `applyVanguardProgression`) contains **critical validation defects**. Specifically, saving throw choices and skill selections are not validated against source class matrices, allowing invalid, duplicate, or out-of-class proficiencies (such as Intelligence saves, Arcana, History, and Religion) to be permanently written to actor traits. Furthermore, rolled hit points and ability score increases are unconstrained by die size or rules-defined step caps.

---

## 1. Observation

1. **Source Rules Contract**:
   - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:
     - Line 7926: `Saving Throws: Dexterity + one of your choice from the following: Strength, Charisma`
     - Line 7927: `Skills: Three from: Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness`
     - Lines 7918–7920: `Hit Dice: 1d8 per Vanguard Level... Hit Points at Higher Levels: 1d8 (or 5) + your Constitution Modifier`
     - Line 8020: `Ability Score Improvement... increase one Ability Score of your choice by 2, or you can increase two Ability Scores of your choice by 1.`

2. **Progression Implementation**:
   - In `ak5e/scripts/vanguard-progression.mjs`:
     - Lines 314–315:
       ```javascript
       // Validate saves
       if (!choices.saves?.length) pending.push("saves");
       ```
     - Lines 356–360:
       ```javascript
       // Saves: Dexterity automatic + chosen Strength or Charisma
       const currentSaves = new Set(system.traits?.saves?.value ?? []);
       currentSaves.add("dex");
       if (choices.saves?.[0]) currentSaves.add(choices.saves[0]);
       writes["system.traits.saves.value"] = Array.from(currentSaves);
       ```
     - Line 318:
       ```javascript
       // Validate skills
       if ((choices.skills ?? []).length !== 3) pending.push("skills");
       ```
     - Lines 377–380:
       ```javascript
       // Skills
       for (const skillKey of choices.skills ?? []) {
         writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
       }
       ```
     - Lines 391–393:
       ```javascript
       const rolled = Number(hpChoice.roll) || 5;
       hpIncrease += Math.max(1, rolled + conMod);
       ```
     - Lines 405–408:
       ```javascript
       for (const inc of asiChoice.increases) {
         abilityIncreases[inc.ability] = (abilityIncreases[inc.ability] ?? 0) + inc.amount;
       }
       ```

3. **Empirical Execution Output**:
   - Executing `node ak5e/tools/stress-vanguard-progression.mjs`:
     ```text
     Starting Adversarial Stress Harness for Vanguard...
     [PASS] Setup Idempotency: 5 sequential runs do not increase item count
     [PASS] Setup Idempotency: Pre-populated authored item is preserved and not overwritten
     [PASS] Progression: Incremental level-up 1 -> 20
     [PASS] Progression Idempotency: Re-run at level 20 does not double-count HP or ASIs
     [PASS] Progression Invariant: Tampered contextKey is rejected
        DEBUG saves test: pending= [] writes[traits.saves]= [ 'dex', 'str' ]
     [FAIL] Progression Invariant: Attempting both STR and CHA saves is rejected or flagged: VIOLATION: choices.saves had length 2 but was not flagged as pending/invalid
        DEBUG invalid save test: pending= [] writes[traits.saves]= [ 'dex', 'int' ]
     [FAIL] Progression Invariant: Invalid saving throw choice (e.g. INT) is rejected: VIOLATION: Progression granted INT save which is not on Vanguard saving throw list!
     [PASS] Progression Invariant: Skill count < 3 is flagged as pending/rejected
     [PASS] Progression Invariant: Skill count > 3 is flagged as pending/rejected
        DEBUG invalid skills test: pending= [] writes= [ 'system.currency.cp', 'system.traits.saves.value', 'system.traits.armorProf.value', 'system.traits.weaponProf.value', 'system.traits.toolProf.value', 'system.skills.arc.value', 'system.skills.his.value', 'system.skills.rel.value', 'system.attributes.hp.max' ]
     [FAIL] Progression Invariant: Skills not on Vanguard list (e.g. Arcana, History, Religion) are rejected: VIOLATION: Progression granted non-Vanguard skills (arc, his, rel)!
        DEBUG duplicate skills test: pending= []
     [FAIL] Progression Invariant: Duplicate skills (e.g. ['acr', 'acr', 'acr']) are rejected: VIOLATION: Duplicate skills ['acr', 'acr', 'acr'] were not flagged as pending/invalid!
        DEBUG rolled HP=50: hpIncrease= 62
     [FAIL] Progression Invariant: Rolled HP > 8 is rejected or clamped: VIOLATION: Granted HP increase of 62 for a d8 roll of 50!
        DEBUG ASI amount=10: dexWrite= 20 initial= 16
     [FAIL] Progression Invariant: ASI increase > 2 is rejected or clamped: VIOLATION: Granted DEX increase of 4 from a single ASI level!

     === SUMMARY OF ADVERSARIAL STRESS HARNESS ===
     Passed: 7/13, Failed: 6/13
     ```

---

## 2. Logic Chain

1. **Setup Idempotency & Customization**:
   - `previewVanguardSetup` maps features up to actor level against existing items via `chapterThreeId` flag and exact name matching (lines 71–76).
   - In `applyVanguardSetup`, only items in `plan.creates` are created; existing items are placed in `plan.kept` and untouched.
   - When executed 5 times sequentially on an actor, item count remains invariant (`actor.items.size` remains 4).
   - Pre-populating an authored item with custom name/description and flags confirms the item is placed in `kept` and its custom description remains untouched. Setup idempotency is confirmed robust.

2. **Progression Idempotency & Level 1–20 Transitions**:
   - Sequential progression across levels 1 through 20 executes without runtime failure.
   - Re-running progression at level 20 using `vanguardChoices(actor)` yields zero pending items and writes identical HP and ability scores (`hp.max` and `dex.value` unchanged). `state.hpLevels` and `state.asiLevels` properly track granted milestones.
   - Passing a tampered `contextKey` string triggers `need(plan.contextKey === contextKey)` in `applyVanguardProgression` line 451, correctly rejecting with an exception.

3. **Saving Throw Validation Breakdown (Vulnerability 1 & 2)**:
   - Line 315 only checks `if (!choices.saves?.length) pending.push("saves");`.
   - If an input contains `saves: ["str", "cha"]`, `!choices.saves?.length` evaluates to `false`. The function fails to validate that the count is exactly 1, silently discarding the second choice without raising a pending requirement or warning.
   - Furthermore, line 359 directly executes `currentSaves.add(choices.saves[0])` without checking whether `choices.saves[0]` is in `VANGUARD_SAVES.choices` (`["str", "cha"]`).
   - Consequently, inputting `saves: ["int"]` is accepted with zero pending flags and writes `["dex", "int"]` to `system.traits.saves.value`, granting an illegal saving throw proficiency not permitted by AK5e rules.

4. **Skill Validation Breakdown (Vulnerability 3 & 4)**:
   - Line 318 only checks `if ((choices.skills ?? []).length !== 3) pending.push("skills");`.
   - It fails to validate that elements of `choices.skills` belong to the allowed `VANGUARD_SKILLS` set (`["acr", "ath", "prc", "per", "ste", "ak5ewilderness"]`).
   - Consequently, inputting non-class skills such as `["arc", "his", "rel"]` passes validation and writes proficiency values directly into `system.skills.arc.value`, `system.skills.his.value`, and `system.skills.rel.value`.
   - In addition, array length is 3 even if duplicate keys are provided (e.g. `["acr", "acr", "acr"]`). The engine accepts the choice without checking uniqueness, granting only 1 unique proficiency instead of 3.

5. **Arbitrary HP Roll and ASI Increases (Vulnerability 5 & 6)**:
   - Line 391 reads `rolled = Number(hpChoice.roll) || 5;` without asserting that `rolled` falls within the 1d8 range `[1, 8]`. Inputting `roll: 50` increases `hp.max` by 62 HP in a single level.
   - Line 406 aggregates `inc.amount` directly into ability score values without verifying valid combinations (+2 to one ability or +1 to two distinct abilities), allowing arbitrary ability score inflation.

---

## 3. Challenges

### [Critical] Challenge 1: Invalid Saving Throw Validation & Illegal Proficiencies Granted
- **Assumption challenged**: The worker claimed that `previewVanguardProgression` validates all choices before commit.
- **Attack scenario**: Pass `saves: ["int"]` or `saves: ["str", "cha"]` into `previewVanguardProgression`.
- **Blast radius**: Actors gain arbitrary saving throw proficiencies (e.g. Intelligence, Wisdom) or silently lose intended second choices. In game sessions, character sheets will carry invalid save proficiencies.
- **Mitigation**: In `previewVanguardProgression`:
  - Validate that `choices.saves` has length exactly 1.
  - Validate that `choices.saves[0]` is included in `VANGUARD_SAVES.choices.map(([_, k]) => k)`. If not, push `"saves"` to `pending`.

### [Critical] Challenge 2: Non-Vanguard and Duplicate Skill Choice Permissiveness
- **Assumption challenged**: `choices.skills` is validated against source class requirements.
- **Attack scenario**: Pass `skills: ["arc", "his", "rel"]` (non-Vanguard skills) or `skills: ["acr", "acr", "acr"]` (duplicates).
- **Blast radius**: Vanguards can acquire any skill proficiency in the D&D5e system (Arcana, History, Religion, etc.) upon character creation or progression, bypassing class constraints.
- **Mitigation**: In `previewVanguardProgression`:
  - Check that `new Set(choices.skills).size === 3`.
  - Check that every skill key in `choices.skills` exists in `VANGUARD_SKILLS.map(([_, k]) => k)`. If invalid, push `"skills"` to `pending`.

### [High] Challenge 3: Unbounded Rolled Hit Points
- **Assumption challenged**: Hit point gains strictly follow the 1d8 Vanguard Hit Die.
- **Attack scenario**: Pass `hp: { 2: { mode: "rolled", roll: 50 } }`.
- **Blast radius**: Out-of-bounds HP gains applied to actor max HP without bounds checking or clamping to `[1, 8]`.
- **Mitigation**: Validate that rolled HP satisfies `Number.isInteger(rolled) && rolled >= 1 && rolled <= 8`. If outside bounds, clamp to `[1, 8]` or treat as invalid.

### [High] Challenge 4: Unbounded Ability Score Increases (ASI)
- **Assumption challenged**: ASI choices adhere to standard D&D5e / AK5e rules (+2 to one score or +1 to two scores).
- **Attack scenario**: Pass `asi: { 4: { increases: [{ ability: "dex", amount: 10 }] } }`.
- **Blast radius**: Actors can instantly max out ability scores at level 4.
- **Mitigation**: Validate that `increases` matches either `[{ ability, amount: 2 }]` or two distinct entries each with `amount: 1`, and that target ability scores do not exceed 20.

---

## Stress Test Results

| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| Setup 5x sequential runs | Item count invariant, 0 duplicates | Count remained 4 items across all 5 runs | **PASS** |
| Setup authored item retention | Custom item & description preserved | Item retained, description unmodified | **PASS** |
| Incremental progression Lv 1 -> 20 | All levels apply cleanly | Completed without error, DEX capped at 20 | **PASS** |
| Level 20 re-run idempotency | HP & ASIs not double-counted | `hp.max` and `dex.value` unchanged | **PASS** |
| Tampered `contextKey` | Rejection with error | Rejected with "character changed" error | **PASS** |
| Skill count < 3 (`["acr", "ath"]`) | Flagged in `pending`, apply rejected | Added to `pending`, apply threw error | **PASS** |
| Skill count > 3 (`["acr", "ath", "ste", "prc"]`) | Flagged in `pending`, apply rejected | Added to `pending`, apply threw error | **PASS** |
| Multiple saves (`["str", "cha"]`) | Flagged in `pending` or rejected | Silently accepted, second save discarded | **FAIL** |
| Invalid save (`["int"]`) | Flagged in `pending`, INT save rejected | Accepted, INT save granted to actor | **FAIL** |
| Non-Vanguard skills (`["arc", "his", "rel"]`) | Flagged in `pending`, non-class rejected | Accepted, Arcana/History/Religion granted | **FAIL** |
| Duplicate skills (`["acr", "acr", "acr"]`) | Flagged in `pending`, rejected | Accepted, only 1 unique proficiency granted | **FAIL** |
| Rolled HP > 8 (`roll: 50`) | Clamped to [1, 8] or rejected | +62 HP granted for d8 roll | **FAIL** |
| ASI amount > 2 (`amount: 10`) | Rejected or clamped to +2 | +4 DEX granted in single level up | **FAIL** |

---

## 4. Caveats

- Subclass progression specifics (beyond base class branch item attachment and core branch features) belong to subclass modules and were not in scope.
- Multiclassing interactions were excluded as AK5e character classes enforce single-class progression per `vanguardProfile` (`blocked: ["MultipleClasses"]`).
- No other caveats.

---

## 5. Conclusion

**Verdict**: **REQUEST_CHANGES**

The Vanguard Base Class setup engine is idempotent and safe against authored item overwrites, but the progression engine in `ak5e/scripts/vanguard-progression.mjs` fails critical progression invariant checks:
1. `choices.saves` lacks choice validation (allowing multiple saves to be submitted, and allowing non-Vanguard saves like INT or WIS to be granted).
2. `choices.skills` lacks allowed-set and uniqueness validation (allowing non-Vanguard skills like Arcana/Religion to be granted, and allowing duplicate skill picks).
3. `choices.hp` and `choices.asi` lack bounds validation against d8 die roll limits and valid ASI distribution schemes.

The worker must address these validation deficiencies in `ak5e/scripts/vanguard-progression.mjs` before Milestone 2 can be approved.

---

## 6. Verification Method

To reproduce the adversarial findings and verify the failures:

1. Run the dedicated stress harness:
   ```bash
   node ak5e/tools/stress-vanguard-progression.mjs
   ```
   **Expected Empirical Result**: Demonstrates 6 failing invariant checks out of 13 tests.

2. Run the baseline project test suites to confirm no syntax or build regressions:
   ```bash
   npm run test:vanguard
   node ak5e/tools/validate-files.mjs
   npm run test:base-classes
   ```
   **Expected**: 62 unit tests pass, 230 files pass syntax check.

3. Invalidation condition:
   Milestone 2 will achieve **APPROVE** when `previewVanguardProgression` enforces:
   - `choices.saves`: Exactly 1 choice from `["str", "cha"]`.
   - `choices.skills`: Exactly 3 unique choices from `VANGUARD_SKILLS`.
   - `choices.hp`: Rolled HP integers clamped/validated in `[1, 8]`.
   - `choices.asi`: Increases conform to valid ASI allocations (+2 or +1/+1).
