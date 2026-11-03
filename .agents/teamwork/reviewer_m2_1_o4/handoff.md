# Handoff Report: Milestone 2 — Vanguard Base Class Review

## Review Summary

**Verdict**: REQUEST_CHANGES

The Milestone 2 (Vanguard Base Class) implementation is of high technical quality, genuine, complete, and free of integrity violations (no facades, no fake tests, no hardcoded shortcuts). Core chassis calculations, level 1–20 feature step progression, additive Temporary HP for Tip of the Spear #2, setup and progression idempotency, and WORKFLOW §3.2 table-play controls are solidly implemented.

However, a **Major Finding** was identified during adversarial review:
In `ak5e/scripts/vanguard-progression.mjs` line 351, starting cash grants `130,000` CP instead of `1,300` CP (a 100x overgrant). In AK5e (Chapter 4 L14 and `ak5e/DECISIONS.md` L1389), 1 LMD equals 1 CP, so 1300 LMD is 1300 CP (as correctly implemented in `guard-progression.mjs:385` and `caster-setup.mjs:939`). The unit test in `vanguard-progression.test.mjs` also asserted `130000`, masking this discrepancy. A targeted 3-line fix will resolve this cleanly.

---

## 1. Observation

1. **Source Rules & Decisions**:
   - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:
     - Lines 7918–7920: Hit Dice 1d8, 8 + CON at 1st level, 1d8 (or 5) + CON per level after 1st.
     - Lines 7922–7927: Light Armour, Light Shields, Light Melee, Messenger Kit; Dexterity + choice of Strength or Charisma; 3 skills from Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness.
     - Line 7938: "OR - 1300 LMD".
     - Lines 7949–7973: Vanguard level progression table (Levels 1–20).
     - Lines 7987–7993: Landstrider (+10 ft speed, Nimble on hit).
     - Lines 7994–8008: Tip of the Spear (60 ft, roll 1d6 table; #2 is additive Temporary HP).
     - Lines 8016–8018: Quick off the Mark (+PB to initiative at Lv 3+).
     - Lines 8031–8033: Extra Attack (2 attacks on Attack action at Lv 5).
     - Lines 8040–8042: Uncanny Dodge (Reaction to halve damage rounding down at Lv 11).
     - Lines 8046–8048: Directed Engagement (Reaction to choose Tip effect at Lv 15).
     - Lines 8049–8053: Lightspeed (second turn at Initiative - 10 in Round 1 at Lv 18).
     - Lines 8054–8058: Approaching Storm (+floor(Level/2) damage in Round 1 at Lv 20).
   - `AK5e_1.3.1_Foundry_Source/04_chapter_4_equipment.txt` Lines 11–16:
     ```
     | Coin | Equivalent in LMD |
     | 1 Copper Piece | 1 LMD |
     | 1 Silver Piece | 10 LMD |
     | 1 Gold Piece | 100 LMD |
     ```
   - `ak5e/DECISIONS.md` Line 1389:
     `Reinforced Outfit OR Combat Gear; one kit proficient with (or 1300 LMD as CP) (L1776–1786).`
   - `ak5e/scripts/guard-progression.mjs` Line 385:
     `writes["system.currency.cp"] = beforeCp + 1300;`

2. **Observed Implementation Code**:
   - `ak5e/scripts/vanguard-progression.mjs` Line 351:
     `writes["system.currency.cp"] = beforeCp + 130000; // 1300 LMD`
   - `ak5e/test/vanguard-progression.test.mjs` Lines 173 and 207:
     `assert.equal(validPlan.writes["system.currency.cp"], 130000); // 1300 LMD`
     `assert.equal(actor.system.currency.cp, 130000);`
   - `ak5e/scripts/vanguard-progression.mjs` Line 315 & Line 318:
     `if (!choices.saves?.length) pending.push("saves");`
     `if ((choices.skills ?? []).length !== 3) pending.push("skills");`
     (Lacks validation that `choices.saves[0]` is in `["str", "cha"]`, and that `choices.skills` contains 3 distinct valid Vanguard skill keys).
   - `ak5e/scripts/vanguard-progression.mjs` Line 389:
     `if (n === 1) { hpIncrease += 8 + conMod; }`
     (Contrast with `vanguard-rules.mjs` Line 117: `let total = Math.max(1, 8 + con);`).

3. **Command Verification Results**:
   - `npm run test:vanguard`:
     Exit code 0, 62 tests passed, 0 failed, 266ms duration.
   - `node ak5e/tools/validate-files.mjs`:
     Exit code 0, "Validated module.json, lang/en.json, and 229 .mjs files."
   - `npm run test:base-classes`:
     Exit code 0 across all 4 runners.
   - `node ak5e/tools/verify-generated-content.mjs`:
     Exit code 0, 2193 top-level records and 801 embedded records verified.

---

## 2. Logic Chain

1. **Integrity Assessment**:
   - Inspected all 5 implementation files (`vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, `vanguard-uses.mjs`) and 3 test files.
   - Verified that calculations are dynamic and functional, with zero hardcoded test returns or dummy facades.
   - Verified that test suites use genuine in-memory Foundry actors and exercise actual code paths.
   - **Conclusion**: ZERO integrity violations detected. Work is authentic.

2. **Rules Fidelity Assessment**:
   - Checked Hit Dice, HP formulas, proficiencies, saves, and skills against Chapter 3 L7904–8085. All 12 feature mechanics are faithfully represented.
   - Checked Tip of the Spear #2: `applyAdditiveTempHP` in `vanguard-features.mjs` and `kind: "tempHP", mode: "additive"` in `vanguard-uses.mjs` correctly implement the explicit source exception for additive Temporary HP.
   - Checked starting currency: Chapter 4 L14 and `DECISIONS.md` L1389 establish 1 LMD = 1 CP. In `vanguard-progression.mjs:351`, the code writes `beforeCp + 130000`, granting 130,000 LMD instead of 1,300 LMD (100x overgrant). The test asserted `130000`, masking the defect. This is a clear rules fidelity discrepancy.

3. **Idempotency Assessment**:
   - `previewVanguardSetup` builds deterministic `contextKey` and only creates missing items, keeping existing ones.
   - `applyVanguardProgression` saves applied levels in `state.hpLevels` and `state.asiLevels`, and sets subsequent choices to `{ mode: "existing" }`.
   - Re-running progression preserves prior Hit Points without double-counting and leaves ability scores intact without inflation.

4. **WORKFLOW §3.2 Table Play Assessment**:
   - `vanguard-uses.mjs` uses `createPlayUses({ ns: "vanguardUses" })`.
   - Requires confirmation prior to execution; cancelling aborts without changes.
   - Out-of-range (>60 ft), missing reactions, and invalid round conditions trigger non-blocking warnings that allow "Use anyway" overrides.
   - Unowned target modifications relay automatically through GM client without approval prompts.
   - Tip of the Spear roll button renders for the player (no auto-rolled dice).
   - Undo receipts in `flags.ak5e.vanguardUses` cleanly revert actor state, target temporary HP, and reaction expenditure within the encounter window.

---

## 3. Caveats

- Milestone 2 covers the Vanguard Base Class. Subclass-specific branch features (beyond branch item attachment and existing Standard Bearer implementation) belong to separate branch modules.
- ActorSheetV2 UI integration is planned for Milestone 6 (`PROJECT.md`).
- Live headless browser testing with `launchTestBrowser()` is planned for Milestone 7 (`PROJECT.md`).
- No other caveats.

---

## 4. Conclusion & Findings

### Verdict: REQUEST_CHANGES

The implementation is structurally sound, highly compliant with WORKFLOW §3.2, and genuinely built. However, the 100x starting currency overgrant requires remediation before final acceptance.

### Findings

#### [Major] Finding 1: Starting Cash Grants 130,000 CP (100x Overgrant)
- **Where**: `ak5e/scripts/vanguard-progression.mjs:351` & `ak5e/test/vanguard-progression.test.mjs:173, 207`
- **Why**: Chapter 3 L7938 specifies starting equipment option "1300 LMD". Chapter 4 L14 and `DECISIONS.md` L1389 define 1 LMD = 1 CP. Line 351 adds `130000` CP (treating LMD as GP), granting 130,000 LMD. In canonical `guard-progression.mjs:385`, this is `beforeCp + 1300`.
- **Suggested Fix**:
  In `ak5e/scripts/vanguard-progression.mjs:351`:
  ```javascript
  writes["system.currency.cp"] = beforeCp + 1300; // 1300 LMD
  ```
  In `ak5e/test/vanguard-progression.test.mjs:173, 207`:
  Update assertion from `130000` to `1300`.

#### [Minor] Finding 2: Missing Domain Validation on Save and Skill Choices
- **Where**: `ak5e/scripts/vanguard-progression.mjs:315, 318`
- **Why**: `previewVanguardProgression` checks that `saves.length > 0` and `skills.length === 3`, but does not validate that `choices.saves[0]` is in `["str", "cha"]` or that `choices.skills` contains 3 distinct valid Vanguard skill keys. Invalid choices (e.g. 3 duplicate skills or `"wis"` save) could bypass client dialog filtering.
- **Suggested Fix**:
  Add validation that `choices.saves[0]` is an allowed choice, and that `new Set(choices.skills).size === 3` with all elements belonging to `VANGUARD_SKILLS`.

#### [Minor] Finding 3: Level 1 HP Gain Lacks Non-Zero Floor Clamp in Progression
- **Where**: `ak5e/scripts/vanguard-progression.mjs:389`
- **Why**: `hpIncrease += 8 + conMod;` does not use `Math.max(1, 8 + conMod)` as implemented in `vanguard-rules.mjs:117`. In extreme edge cases with negative CON modifiers <= -8, this could produce non-positive HP gain.
- **Suggested Fix**:
  Change line 389 to `hpIncrease += Math.max(1, 8 + conMod);`.

---

## 5. Verification Method

To verify the implementation and test findings independently:
1. Run Vanguard tests:
   ```bash
   npm run test:vanguard
   ```
2. Validate static cleanliness:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
3. Run base class suite:
   ```bash
   npm run test:base-classes
   ```
4. Verify currency mapping:
   ```bash
   node -e '
   import("./ak5e/scripts/vanguard-progression.mjs").then(m => {
     console.log("Check line 351 in vanguard-progression.mjs");
   });
   '
   ```
5. Invalidation conditions:
   If `vanguard-progression.mjs` line 351 is updated to `+ 1300` and tests in `vanguard-progression.test.mjs` are updated to match, and all tests pass with 0 errors, the verdict transitions to APPROVE.
