# Forensic Audit Report: Milestone 2 — Vanguard Base Class

**Work Product**: Milestone 2 (Vanguard Base Class Implementation)  
**Auditor**: auditor_m2 (`auditor_m2_o4`)  
**Profile**: General Project  
**Integrity Mode**: Development Mode (inferred and confirmed directly from `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

### Phase Results

- **Anti-Cheating & Hardcoded Output Detection**: **PASS** — Zero hardcoded assertion outputs, fixed test pass constants, or fabricated returns found across all audited files.
- **Facade & Dummy Implementation Detection**: **PASS** — All functions across `vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, and `vanguard-uses.mjs` contain genuine mathematical, procedural, or transactional logic; no `NotImplementedError` or dummy stubs.
- **Pre-populated Artifact Detection**: **PASS** — Zero pre-populated test logs, cache files, or attestation files exist in the repository.
- **AST & Syntax Integrity**: **PASS** — `node --check` executed cleanly across all 8 Vanguard files with 0 syntax or parsing errors.
- **Static File & Content Validation**: **PASS** — `node ak5e/tools/validate-files.mjs` validated module.json, lang/en.json, and 229 `.mjs` files with zero errors. `node ak5e/tools/verify-generated-content.mjs` verified 2,193 source records with 0 discrepancies.
- **Automated Test Execution**: **PASS** — `npm run test:vanguard` passed 62/62 tests (0 failures); `npm run test:base-classes` exited with code 0.
- **Source Fidelity (AK5e Ch. 3 L7904–8085)**: **PASS** — Exact mathematical formulas, level progression steps, proficiency arrays, and additive temporary HP rule for Tip #2 match source text line-by-line.
- **Table Play Philosophy (WORKFLOW §3.2)**: **PASS** — Confirmation required before feature use, non-blocking warnings with "Use anyway" overrides, 0-clamping on shortfalls, unowned target GM relay, interactive roll buttons (no auto-rolling), and encounter-window undo receipts.
- **Setup & Progression Idempotency**: **PASS** — Verified that re-running setup or progression creates zero duplicate items, preserves existing HP maximums, and adheres to the `contextKey` hash contract.

---

## 1. Observation

### 1.1 Source Rules Authority
- Source file: `/home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (Lines 7904–8085):
  - Hit Points: Hit Dice 1d8, 8 + CON at 1st level, 1d8 (or 5) + CON per level after 1st (Lines 7918–7920).
  - Proficiencies: Light Armour, Light Shields, Light Melee Weapons, Messenger Kit (Lines 7922–7925).
  - Saves: Dexterity + one of Strength or Charisma (Line 7926).
  - Skills: 3 from Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness (Line 7927).
  - Starting Equipment: Light Melee, A) Light Melee or B) Light Shield, A) Reinforced Outfit or B) Light Combat Gear, 1x Tool Kit, or 1300 LMD (Lines 7929–7939).
  - Level Step Table: Landstrider (Lv 1), Tip of the Spear (Lv 1), Vanguard Branch (Lv 1, 4, 10, 13, 17), Quick off the Mark (Lv 3), Extra Attack (Lv 5), Uncanny Dodge (Lv 11), Directed Engagement (Lv 15), Lightspeed (Lv 18), Approaching Storm (Lv 20) (Lines 7949–7973).
  - Special additive rule: Tip of the Spear roll 2 explicitly states "these Hit Points are additive with any Temporary Hit Points they already have" (Line 8003).

### 1.2 Authored Implementation Files Audited
1. `ak5e/scripts/vanguard-rules.mjs` (267 lines, 9,366 bytes)
2. `ak5e/scripts/vanguard-features.mjs` (241 lines, 8,190 bytes)
3. `ak5e/scripts/vanguard-setup.mjs` (107 lines, 4,838 bytes)
4. `ak5e/scripts/vanguard-progression.mjs` (494 lines, 19,470 bytes)
5. `ak5e/scripts/vanguard-uses.mjs` (337 lines, 14,029 bytes)
6. `ak5e/test/vanguard-rules.test.mjs` (210 lines, 7,780 bytes)
7. `ak5e/test/vanguard-features.test.mjs` (298 lines, 10,196 bytes)
8. `ak5e/test/vanguard-progression.test.mjs` (268 lines, 9,176 bytes)

### 1.3 Tool Execution Commands and Results

#### Command: `node --check <files>`
```text
node --check ak5e/scripts/vanguard-rules.mjs ak5e/scripts/vanguard-features.mjs ak5e/scripts/vanguard-setup.mjs ak5e/scripts/vanguard-progression.mjs ak5e/scripts/vanguard-uses.mjs ak5e/test/vanguard-rules.test.mjs ak5e/test/vanguard-features.test.mjs ak5e/test/vanguard-progression.test.mjs
Exit Code: 0
Stdout: (empty)
Stderr: (empty)
```

#### Command: `npm run test:vanguard`
```text
> test:vanguard
> node --test ak5e/test/vanguard-*.test.mjs ak5e/test/tip-of-the-spear.test.mjs ak5e/test/standard-bearer.test.mjs

✔ queued canvas refresh does not recreate removed Standard Bearer support (7.001083ms)
... [truncated 35 Standard Bearer / Tip tests] ...
✔ Landstrider: Walking speed bonus and Nimble target tracking (2.636615ms)
✔ Quick off the Mark: level unlock and initiative bonus (1.041164ms)
✔ Extra Attack: level 5 unlock (1.819187ms)
✔ Uncanny Dodge: level 11 unlock, damage halving, and reaction spend (4.738512ms)
✔ Directed Engagement: level 15 unlock and reaction state (0.911988ms)
✔ Lightspeed: level 18 unlock and initiative calculation (0.432173ms)
✔ Approaching Storm: level 20 unlock and Round 1 damage bonus (0.518488ms)
✔ Additive Temporary HP: stacks additively with existing THP (0.522856ms)
✔ executeTipOfTheSpear: integration with tip-of-the-spear helpers (0.754058ms)
✔ vanguardUses: table-play plan execution, warnings, overrides, and undo (4.749563ms)
✔ previewVanguardSetup: generates feature items up to actor level and deterministic contextKey (3.392216ms)
✔ applyVanguardSetup: idempotent application preserving existing features (1.800111ms)
✔ inspectVanguardFields: returns schema options for branch, saves, skills, equipment, and level choices (1.748222ms)
✔ previewVanguardProgression: detects missing choices and computes preview (1.212351ms)
✔ applyVanguardProgression: level 1 progression grant and idempotency (1.689309ms)
✔ applyVanguardProgression: level-up to 4 applies ASI and talents without resetting customizations (1.223311ms)
✔ checkLevel: boundary validation and type safety (3.057478ms)
✔ pbForLevel: correct progression across all 20 levels (0.445459ms)
✔ hitPointsAtLevel: fixed and rolled HP formulas across levels (0.408459ms)
✔ feature scaling formulas: Approaching Storm and Landstrider (0.469094ms)
✔ DC calculations: martialDC and vanguardDC (4.184926ms)
✔ progression table: step definitions for levels 1–20 (0.995898ms)
✔ proficiencies and choices: rules matrices adhere to Ch. 3 (0.400483ms)
✔ vanguardProfile: actor inspection and edge cases (0.877923ms)
✔ calculateVanguardProfile: returns full interface contract object (0.515332ms)
ℹ tests 62
ℹ suites 0
ℹ pass 62
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 264.531263
Exit Code: 0
```

#### Command: `node ak5e/tools/validate-files.mjs`
```text
Validated module.json, lang/en.json, and 229 .mjs files.
Exit Code: 0
```

#### Command: `npm run test:base-classes`
```text
> test:base-classes
> npm run test:vanguard && npm run test:supporter && npm run test:specialist && npm run test:medic
...
ℹ tests 62 (test:vanguard)
ℹ pass 62
ℹ fail 0
...
Exit Code: 0 across all runners.
```

#### Command: `node ak5e/tools/verify-generated-content.mjs`
```text
Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
Top-level records: 2193; Chapter 6 embedded features: 801.
Exit Code: 0
```

### 1.4 Empirical Stress Testing (Auditor-Executed Node Invocations)
1. Mathematical Logic & Extremes:
   - `hitPointsAtLevel(1, -5)` evaluates to 3 (8 - 5 = 3);
   - `hitPointsAtLevel(1, -10)` clamps to 1;
   - `hitPointsAtLevel(5, -10)` clamps each gained level to 1 (total: 5);
   - `hitPointsAtLevel(20, 5)` evaluates to 203 (13 + 19 * 10 = 203);
   - `martialDC` correctly takes `Math.max(STR, DEX)`, whereas `vanguardDC` uses `DEX` only;
   - `calculateUncannyDodge(99)` returns 49 (`Math.floor(99 / 2)`);
   - `lightspeedSecondInitiative(25)` returns 15, `(5)` returns -5.
2. Security & Tampering Resistance:
   - `applyVanguardSetup` throws `Error: Confirm the previewed Vanguard setup first.` when `confirmed !== true`;
   - `applyVanguardSetup` throws `Error: The character changed since the preview...` when `contextKey` does not match;
   - `applyVanguardProgression` throws when required choices (branch, saves, skills, equipment) are missing.
3. Multi-Run Idempotency:
   - `applyVanguardSetup` second run results in `creates.length === 0` and `kept.length === initialItemCount`;
   - `applyVanguardProgression` stores granted levels in `state.hpLevels` and `state.asiLevels`, setting them to `"mode": "existing"` in saved state; subsequent progression runs generate 0 HP and 0 ASI writes.
4. Table Play & Undo (WORKFLOW §3.2):
   - Out-of-range Tip target throws `PlayWarnings` with id `range`;
   - Overriding with `overridden: ["range"]` allows execution ("Use anyway");
   - Tip outcome 2 adds temporary HP additively (`10 + 6 = 16`);
   - `vanguardUses.undo` cleanly reverts temporary HP back to 10;
   - Uncanny Dodge spends reaction, and `vanguardUses.undo` cleanly reverts reaction and receipt state.

---

## 2. Logic Chain

1. **Integrity Mode Establishment**:
   - `ORIGINAL_REQUEST.md` explicitly designates `Integrity mode: development`. Under development mode, external framework libraries and shared code modules are permitted, while hardcoded test outputs, dummy facade implementations, and fabricated artifacts are strictly prohibited.
2. **Phase 1 Static Anti-Cheating Analysis**:
   - Grep analysis for fixed integer returns, boolean stubs, and empty function blocks revealed that all return statements in the 5 production files (`vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, `vanguard-uses.mjs`) serve as legitimate guard clauses or direct rules constants (such as `landstriderSpeedBonus` returning 10 per Ch. 3 L7990).
   - Zero `TODO`, `FIXME`, `STUB`, or `MOCK` placeholders exist in production code or test files.
   - Zero tautological assertions (e.g., asserting literals on literals) exist in `ak5e/test/vanguard-*.test.mjs`. All assertions invoke actual functions or inspect mutated document states.
3. **Phase 2 AST and Structural Integrity**:
   - `node --check` passed across all 8 files with zero syntax errors.
   - `ak5e/tools/validate-files.mjs` validated 229 `.mjs` files including all 5 Vanguard scripts, ensuring proper ESM export/import structure and adherence to project conventions.
4. **Behavioral and Empirical Verification**:
   - Running the test suites independently confirmed that 62/62 tests execute and pass in under 300ms.
   - The auditor wrote and ran independent inline stress scripts confirming boundary conditions, error throwing on corrupted or missing `contextKey`, additive THP stacking, and table play undo.
5. **Synthesis & Conclusion**:
   - Because all checks passed with zero integrity failures, zero facades, zero hardcoding, and complete rules fidelity, the implementation is authentic and genuinely functional.

---

## 3. Caveats

- **Subclass Scope**: Milestone 2 encompasses the Vanguard Base Class chassis, rules, features, setup, progression, table uses, and unit tests. Subclasses (Pioneer, Charger, Tactician, Agent) and ActorSheetV2 UI integration are defined for subsequent milestones in `PROJECT.md` (e.g., M6 sheet integration, M7 live browser validation).
- No other caveats; all Milestone 2 requirements are fully satisfied and empirically verified.

---

## 4. Conclusion

The Milestone 2 work product (Vanguard Base Class) is completely authentic, rigorously implemented, and free of any cheating, facade implementations, or hardcoded shortcuts. All source mechanics from AK5e Chapter 3 and table-play standards from WORKFLOW §3.2 are genuinely satisfied.

**Final Audit Verdict**: **CLEAN**

---

## 5. Verification Method

To independently reproduce this audit:

1. Run syntax verification:
   ```bash
   node --check ak5e/scripts/vanguard-*.mjs ak5e/test/vanguard-*.test.mjs
   ```
2. Run file validation:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
3. Run the Vanguard test suite:
   ```bash
   npm run test:vanguard
   ```
4. Run the full base-classes test suite:
   ```bash
   npm run test:base-classes
   ```
5. Run generated content verification:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
6. Invalidation Conditions:
   - Any test failure in `npm run test:vanguard`;
   - Any failure in `node ak5e/tools/validate-files.mjs`;
   - Any discovery of a method returning static constants without evaluating input state.
