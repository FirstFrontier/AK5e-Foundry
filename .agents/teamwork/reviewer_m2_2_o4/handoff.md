# Handoff Report: Milestone 2 — Vanguard Base Class Independent Quality & Adversarial Review

**Agent**: `reviewer_m2_2`  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_2_o4/`  
**Verdict**: **REQUEST_CHANGES**  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

The Milestone 2 (Vanguard Base Class) implementation demonstrates high technical capability in pure mathematical calculations, level scaling, additive Temporary HP, reaction management, WORKFLOW §3.2 table-play interactions (confirmations, non-blocking overrides, dice roll buttons, encounter-window undo), and setup feature deduplication. Furthermore, no integrity violations (hardcoded test facades, dummy implementations, or shortcuts) were detected.

However, independent adversarial analysis and empirical stress testing revealed three **Critical** defects and one **Major** defect in `ak5e/scripts/vanguard-progression.mjs`:
1. **Critical Choice Validation Failure (Saving Throws)**: `choices.saves` only checks array presence, allowing characters to be granted non-class saving throw proficiencies (e.g. Intelligence, Wisdom) or silently dropping multiple selections.
2. **Critical Choice Validation Failure (Skills)**: `choices.skills` only checks `length === 3`, permitting duplicate skills (e.g. `["acr", "acr", "acr"]`) and skills completely outside the Vanguard class list (e.g. Arcana, History, Religion).
3. **Critical Idempotency Failure (Starting Equipment)**: Starting equipment is not tracked or flagged as granted, causing subsequent level-ups (e.g. Level 1 -> 2) or progression re-runs to re-grant starting equipment items or duplicate cash (+1300 LMD / 130,000 cp each time).
4. **Major Boundary Validation Failure (Hit Points & ASI)**: Rolled HP and ASI amounts are not clamped or validated against 1d8 limits or legal ASI distributions (+2 or +1/+1).

---

## 1. Observation

### 1.1 Test Suite & Static Analysis Execution
- **Command**: `npm run test:vanguard`
  - **Output**: 62 tests passed, 0 failed (duration 275ms).
  - All 62 unit tests across `vanguard-rules.test.mjs`, `vanguard-features.test.mjs`, `vanguard-progression.test.mjs`, `tip-of-the-spear.test.mjs`, and `standard-bearer.test.mjs` exited with code 0.
- **Command**: `node ak5e/tools/validate-files.mjs`
  - **Output**: "Validated module.json, lang/en.json, and 229 .mjs files." (Exit code 0).
- **Command**: `npm run test:base-classes`
  - **Output**: Exit code 0 across all 4 class test suites (test:vanguard 62, test:supporter 0, test:specialist 0, test:medic 0).
- **Command**: `node ak5e/tools/verify-generated-content.mjs`
  - **Output**: "Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source. Top-level records: 2193; Chapter 6 embedded features: 801." (Exit code 0).

### 1.2 Source Rules Authority
- `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:
  - Line 7918–7920: `Hit Dice: 1d8 per Vanguard Level... Hit Points at 1st Level: 8 + your Constitution Modifier... Hit Points at Higher Levels: 1d8 (or 5) + your Constitution Modifier`
  - Line 7926: `Saving Throws: Dexterity + one of your choice from the following: Strength, Charisma`
  - Line 7927: `Skills: Three from: Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness`
  - Line 7938: `OR 1300 LMD`
  - Lines 7949–7973: Vanguard Table (Level 1–20 features, Extra Attack at Lv 5, Uncanny Dodge at Lv 11, Directed Engagement at Lv 15, Lightspeed at Lv 18, Approaching Storm at Lv 20).
  - Line 8003: `They gain 1d6 Temporary Hit Points; these Hit Points are additive with any Temporary Hit Points they already have.`

### 1.3 Implementation Inspection
1. **Saving Throw Validation** (`ak5e/scripts/vanguard-progression.mjs`):
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
   - Direct execution test:
     Passing `choices.saves = ["int"]` yields `pending: []` and writes `["dex", "int"]` to `system.traits.saves.value`.
     Passing `choices.saves = ["str", "cha"]` yields `pending: []` and silently drops `"cha"`.

2. **Skill Choice Validation** (`ak5e/scripts/vanguard-progression.mjs`):
   - Line 318:
     ```javascript
     // Validate skills
     if ((choices.skills ?? []).length !== 3) pending.push("skills");
     ```
   - Lines 378–380:
     ```javascript
     // Skills
     for (const skillKey of choices.skills ?? []) {
       writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
     }
     ```
   - Direct execution test:
     Passing `choices.skills = ["arc", "his", "rel"]` yields `pending: []` and writes proficiencies in Arcana, History, and Religion.
     Passing `choices.skills = ["acr", "acr", "acr"]` yields `pending: []` and only grants 1 proficiency instead of 3 unique ones.

3. **Starting Equipment Idempotency on Level-Up** (`ak5e/scripts/vanguard-progression.mjs`):
   - Lines 337–352:
     ```javascript
     // Starting equipment items
     if (choices.startingEquipment?.mode === "items") {
       const eqKeys = ["weapon1", "weapon2", "armour"];
       for (const key of eqKeys) {
         const eqId = choices.startingEquipment[key];
         if (eqId) {
           const eqEntry = EQUIPMENT.find(e => e.id === eqId);
           if (eqEntry) createItems.push(equipmentData(eqEntry));
         }
       }
       // Grant Messenger kit
       const kitEntry = EQUIPMENT.find(e => e.id === "tool-messenger-kit-9");
       if (kitEntry) createItems.push(equipmentData(kitEntry));
     } else if (choices.startingEquipment?.mode === "cash") {
       const beforeCp = Number(sourceSystem(actor).currency?.cp ?? 0);
       writes["system.currency.cp"] = beforeCp + 130000; // 1300 LMD
     }
     ```
   - Lines 457–474 only record and mark `{ mode: "existing" }` for `hpLevels` and `asiLevels`. `startingEquipment` is never marked as existing or recorded as granted.
   - Direct execution test:
     Level 1 progression with cash grants 130,000 cp.
     Level-up to 2 using `vanguardChoices(actor)` (which retains `saved.startingEquipment = { mode: 'cash' }`) writes `system.currency.cp = 260000` (another 1300 LMD granted).
     Level-up to 2 using `startingEquipment: { mode: "items" }` re-creates starting armor and tool items.

4. **Arbitrary Rolled HP & ASI** (`ak5e/scripts/vanguard-progression.mjs`):
   - Lines 391–393: `rolled = Number(hpChoice.roll) || 5; hpIncrease += Math.max(1, rolled + conMod);` without asserting `rolled <= 8`.
   - Lines 405–408: aggregates arbitrary `inc.amount` without checking valid +2 / +1/+1 allocations.

5. **Integrity Audit**:
   - Inspected `vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, `vanguard-uses.mjs`.
   - No hardcoded test responses or facade implementations detected.
   - Real calculations and transactional Foundry document writes exist throughout.

---

## 2. Logic Chain

1. **Source Rules & Requirements**:
   - Per AK5e Chapter 3 L7926, a Vanguard must receive Dexterity saving throw proficiency plus exactly one choice between Strength and Charisma.
   - Per AK5e Chapter 3 L7927, a Vanguard must choose exactly three distinct skills from: Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness.
   - Per ORIGINAL_REQUEST.md R1, character progression must be strictly idempotent across repeated runs and incremental level-ups without duplicate item or currency grants.
2. **Analysis of `previewVanguardProgression`**:
   - `choices.saves`: Line 315 only tests `!choices.saves?.length`. If a caller supplies an invalid saving throw (e.g. `["int"]`), `pending` does not include `"saves"`. Line 359 then writes `["dex", "int"]` to `traits.saves.value`. If a caller supplies multiple choices (e.g. `["str", "cha"]`), line 359 takes `choices.saves[0]` and silently ignores the second, without notifying the caller. (Observation 1.3.1).
   - `choices.skills`: Line 318 only tests `(choices.skills ?? []).length !== 3`. If a caller supplies three identical skills (`["acr", "acr", "acr"]`), the check passes, granting only one unique skill. If a caller supplies non-class skills (`["arc", "his", "rel"]`), the check passes, granting proficiencies in Arcana, History, and Religion. (Observation 1.3.2).
   - `startingEquipment`: Lines 337–352 check `choices.startingEquipment?.mode` directly on every preview invocation. When an actor levels up from level 1 to level 2, `vanguardChoices(actor)` loads the saved `choices.startingEquipment`. Because `applyVanguardProgression` (lines 457–474) only marks `hp` and `asi` as `{ mode: "existing" }`, `startingEquipment` remains active. Therefore, previewing and applying level 2 creates a second set of starting equipment items or grants an additional 1300 LMD. (Observation 1.3.3).
3. **Adversarial Verification of Invariants**:
   - Testing `node ak5e/tools/stress-vanguard-progression.mjs` confirmed 6 invariant check failures regarding invalid saves, duplicate skills, non-class skills, rolled HP > 8, and unbounded ASI increases. (Observation 1.1).
   - Standalone node tests directly reproduced the starting equipment duplication bug on level-up. (Observation 1.3.3).
4. **Conclusion**:
   - While setup (`vanguard-setup.mjs`), rules (`vanguard-rules.mjs`), features (`vanguard-features.mjs`), and table uses (`vanguard-uses.mjs`) are robust and conform to project standards, the progression engine (`vanguard-progression.mjs`) fails basic input validation and idempotency requirements. Changes must be requested before approval.

---

## 3. Findings

### [Critical] Finding 1: Lack of Saving Throw Choice Validation in `previewVanguardProgression`
- **What**: `choices.saves` is not validated against the permitted saving throw list (`VANGUARD_SAVES.choices`) and is not constrained to exactly 1 choice.
- **Where**: `ak5e/scripts/vanguard-progression.mjs`, lines 314–315 & lines 356–360.
- **Why**: Allows characters to be granted illegal saving throws (e.g. Intelligence, Wisdom) or silently discards multi-choice inputs without user warning.
- **Suggestion**: In `previewVanguardProgression`:
  ```javascript
  const allowedSaves = VANGUARD_SAVES.choices.map(([_, key]) => key);
  if (!choices.saves?.length || choices.saves.length !== 1 || !allowedSaves.includes(choices.saves[0])) {
    pending.push("saves");
  }
  ```

### [Critical] Finding 2: Lack of Allowed-Set and Uniqueness Validation for Skills in `previewVanguardProgression`
- **What**: `choices.skills` does not verify that the 3 choices are unique or that they belong to the 6 valid Vanguard skills.
- **Where**: `ak5e/scripts/vanguard-progression.mjs`, line 318 & lines 378–380.
- **Why**: Allows characters to acquire non-class proficiencies (e.g. Arcana, History, Religion) or submit duplicates (`["acr", "acr", "acr"]`), resulting in fewer than 3 proficiencies.
- **Suggestion**: In `previewVanguardProgression`:
  ```javascript
  const allowedSkills = new Set(VANGUARD_SKILLS.map(([_, key]) => key));
  const chosenSkills = new Set(choices.skills ?? []);
  if (chosenSkills.size !== 3 || [...chosenSkills].some(s => !allowedSkills.has(s))) {
    pending.push("skills");
  }
  ```

### [Critical] Finding 3: Starting Equipment Duplication on Level-Up / Re-run (Idempotency Violation)
- **What**: Starting equipment (items or 1300 LMD cash) is re-evaluated and granted again during incremental level-ups or progression re-runs.
- **Where**: `ak5e/scripts/vanguard-progression.mjs`, lines 337–352 & lines 457–474.
- **Why**: Violates the idempotency contract of the progression engine (ORIGINAL_REQUEST.md R1). Leveling up from 1 to 2 grants an additional 1300 LMD or duplicates starting equipment items.
- **Suggestion**: Track `state.startingEquipmentGranted = true` (or mark `choices.startingEquipment = { mode: "existing" }` upon first application), and skip granting starting items/cash if already granted.

### [Major] Finding 4: Unbounded Rolled Hit Points and Ability Score Increases
- **What**:
  - Rolled HP does not validate that `rolled` is within `[1, 8]`. A roll of 50 grants 50 + CON HP.
  - ASI does not validate that increases conform to standard rules (+2 to one ability or +1 to two distinct abilities).
- **Where**: `ak5e/scripts/vanguard-progression.mjs`, lines 391–393 & lines 405–408.
- **Why**: Allows arbitrary out-of-rules HP and ability score inflation during progression.
- **Suggestion**: Clamp or validate `rolled` to `[1, 8]` for d8 Hit Dice. Validate that `asiChoice.increases` strictly matches `[{ ability, amount: 2 }]` or two distinct entries with `amount: 1`.

### [Minor] Finding 5: `approachingStormDamageBonus` Combat Context Assumption
- **What**: In `approachingStormDamageBonus(actor, combat)`, if `combat` is omitted or null, it returns the damage bonus (`Math.floor(lvl / 2)`) without requiring combat context.
- **Where**: `ak5e/scripts/vanguard-features.mjs`, lines 172–177.
- **Why**: Ch. 3 L8057 states Approaching Storm applies "during the first Round of a combat".
- **Suggestion**: Document that passing `combat = null` is explicitly treated as a manual out-of-combat / Round 1 assumption.

---

## 4. Verified Claims

- **Integrity Audit**: Clean. No dummy implementations, hardcoded test facades, or bypassed logic detected.
- **`vanguard-rules.mjs`**: Verified robust. Functional calculations for `pbForLevel`, `hitPointsAtLevel` (clamping minimum gain to 1 per level even with negative CON), `martialDC`, `vanguardDC`, and `calculateVanguardProfile` match source rules.
- **`vanguard-features.mjs`**:
  - `applyAdditiveTempHP` verified: properly adds to existing THP when current THP is 0, positive, or across multiple applications; strictly rejects 0, negative values, and non-integers.
  - Boundary features verified: Landstrider (Lv 1), Quick off the Mark (Lv 3), Extra Attack (Lv 5), Uncanny Dodge (Lv 11), Directed Engagement (Lv 15), Lightspeed (Lv 18), Approaching Storm (Lv 20) unlock at exact source levels.
- **`vanguard-setup.mjs`**: Verified idempotent. Repeated executions do not duplicate core features; pre-authored items and custom descriptions are preserved in `kept`.
- **`vanguard-uses.mjs`**: Verified compliant with WORKFLOW §3.2. Confirms uses, issues non-blocking warnings with override support, clamps at 0, supports automatic GM relay, does not auto-roll dice, and records reversible undo receipts under `flags.ak5e.vanguardUses`.

---

## 5. Caveats

- Vanguard subclass-specific features (beyond branch selection and existing Standard Bearer) belong to separate subclass modules and were excluded from base class scope.
- Live Foundry browser tests with `launchTestBrowser()` belong to Milestone 7 per `PROJECT.md`.
- No other caveats.

---

## 6. Conclusion

**Verdict**: **REQUEST_CHANGES**

Milestone 2 cannot be approved in its current state due to critical validation and idempotency vulnerabilities in `ak5e/scripts/vanguard-progression.mjs` (Findings 1, 2, and 3). Once the worker constrains saving throw choices to exactly 1 from `["str", "cha"]`, restricts skill choices to exactly 3 unique skills from `VANGUARD_SKILLS`, prevents starting equipment re-grants on level-up, and bounds HP/ASI inputs, Milestone 2 will be ready for approval.

---

## 7. Verification Method

To independently verify these findings:

1. Run the progression adversarial stress test:
   ```bash
   node ak5e/tools/stress-vanguard-progression.mjs
   ```
   **Expected**: Demonstrates failures in saving throw validation, skill choice validation, duplicate skills, and out-of-bounds HP/ASI.

2. Verify starting equipment duplication on level-up:
   ```bash
   node -e '
   import("./ak5e/test/base-classes-fixture.mjs").then(async fix => {
     fix.setupFoundryGlobals();
     const { previewVanguardProgression, applyVanguardProgression, vanguardChoices } = await import("./ak5e/scripts/vanguard-progression.mjs");
     const vClass = fix.createTestItem({ name: "Vanguard", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
     const actor = fix.createTestActor({ items: [vClass] });
     const c1 = { branch: "subclass-vanguard-agent", saves: ["str"], skills: ["acr", "ath", "ste"], tool: "Messenger Kit", startingEquipment: { mode: "cash" }, hp: { 1: { mode: "fixed" } } };
     const p1 = await previewVanguardProgression(actor, c1);
     await applyVanguardProgression(actor, { confirmed: true, contextKey: p1.contextKey, choices: c1 });
     vClass.system.levels = 2;
     const c2 = vanguardChoices(actor);
     const p2 = await previewVanguardProgression(actor, c2);
     console.log("Level 2 preview writes currency:", p2.writes["system.currency.cp"]);
   });'
   ```
   **Expected Output**: `260000` (proves starting 1300 LMD is granted a second time upon leveling up).

3. Run project verification suite:
   ```bash
   npm run test:vanguard
   node ak5e/tools/validate-files.mjs
   npm run test:base-classes
   ```
   **Expected**: Exits cleanly with code 0 across all unit tests and static syntax checks.
