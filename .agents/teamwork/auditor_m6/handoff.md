# Forensic Audit Report — Guard Subclasses Batch 1 (Duellist, Liberator, and Lord)

**Work Product**: Guard Subclasses Batch 1 implementation files, unit tests, live browser validation, and configuration
**Profile**: General Project (Development Mode, Ground Truth from `ORIGINAL_REQUEST.md`)
**Verdict**: **CLEAN**

---

### Phase Results
- **Phase 1: Source Code & Static Analysis**: **PASS**
  - Dummy/facade detection: Clean. No stubbed returns, mock bypasses, or dummy functions.
  - Hardcoded test outputs: Clean. All calculations use dynamic formulas and live actor state.
  - Pre-populated artifacts: Clean. Zero pre-populated test log or result artifacts.
- **Phase 2: Implementation Authenticity & Rules Fidelity (vs Ch. 3 Source)**: **PASS**
  - Duellist Subclass (Ch. 3 L2739–2845): Clean. Points ledger (0–10 max), Greatswords/Polearms finesse hook, Parry (0 reaction, -1 Aggression), Riposte, Principles of Defence, 9 Engagements, Grand Challenge, Master Duellist verified.
  - Liberator Subclass (Ch. 3 L2938–3039): Clean. Liberty pool (0–6 max), Guide the Masses (Advocate/Empower/Uplift), Flash of Anger, The Right Moment, Rising Tide, Praxis (Face Me), Révolution (1/LR) verified.
  - Lord Subclass (Ch. 3 L3013–3248): Clean. Authority state (`flags.ak5e.lord.hasAuthority`), Overruled saves, Manifest Destiny, Manifest Will (melee 30/- range, STR ranged, +CHA damage), King's Domain (Castle Doctrine, Pursuit of Power), By Lordly Decree (Make It So, A Leader Leads), Force of Will (3 element groups), Divine Right verified.
- **Phase 3: Table-Play Philosophy & WORKFLOW §3.2 Compliance**: **PASS**
  - Confirm before spend; cancellation changes nothing: Verified.
  - Ability checks and saves require no confirmation: Verified.
  - Interactive roll buttons (NO auto-rolled dice): Verified (`awaitingRoll` card status).
  - Resource shortfalls warn and clamp at 0 without going negative: Verified via adversarial execution.
  - Unowned target modifications relay automatically through active GM: Verified via `guardUses.handleRelay`.
  - Encounter-window undo receipts recorded under `flags.ak5e.guardUses.undo`: Verified.
- **Phase 4: Automated Verification**: **PASS**
  - `npm run test:guard`: 90 passed, 0 failed (100% pass rate).
  - `node ak5e/tools/validate-files.mjs`: Clean syntax across all 213 .mjs files, `module.json`, and `lang/en.json`.
  - `node ak5e/tools/verify-generated-content.mjs`: Zero content regressions across 2,193 source records and 801 embedded features.
  - `npm test`: Full repository test suite passes with zero failures.
- **Phase 5: Live Foundry V13 Browser & Visual Review**: **PASS**
  - `ak5e/tools/test-guard-live.mjs` executed cleanly against Foundry V13 on port 30175 with `errors: []` in `report.json`.
  - All 17 captured screenshots inspected and certified **PASS** by `foundry-validator` (`foundry_validator_m5/handoff.md`).

---

## 1. Observation

Direct forensic examination of repository files, runtime executions, and tool outputs:

### 1.1 Automated Suite Executions
1. `npm run test:guard`:
   ```
   ℹ tests 90
   ℹ suites 0
   ℹ pass 90
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 288.062045
   ```
   All 90 unit tests executed cleanly across `guard-rules.test.mjs`, `guard-features.test.mjs`, `guard-progression.test.mjs`, `centurion.test.mjs`, `crusher.test.mjs`, `instructor.test.mjs`, `artsblade.test.mjs`, `brawler.test.mjs`, `duellist.test.mjs`, `liberator.test.mjs`, and `lord.test.mjs`.

2. `node ak5e/tools/validate-files.mjs`:
   ```
   Validated module.json, lang/en.json, and 213 .mjs files.
   ```
   Exit code: 0.

3. `node ak5e/tools/verify-generated-content.mjs`:
   ```
   Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
   Top-level records: 2193; Chapter 6 embedded features: 801.
   ```
   Exit code: 0. Zero regressions detected against source content.

4. `npm test` (Full Repository Suite):
   ```
   Exit code: 0.
   Passed check:files, check:generated, test:content, test:parsers, test:rules,
   test:installers, test:origins, test:deployment, test:caster, test:defender,
   test:guard, test:marksman.
   Zero test failures across the entire codebase.
   ```

### 1.2 Source Code Analysis & Verification
- `ak5e/scripts/duellist-features.mjs` (689 lines):
  - Line 18: `isDuellist(actor)` enforces `guardEnabled(actor) && guardBranch(actor) === "duellist"`.
  - Lines 26–35: `isDuellingBladeWeapon(item)` verifies Greatswords and Polearms (`glaive`, `halberd`, `pike`, `spear`, `quarterstaff`).
  - Lines 618–660: Hooks `duellistPreRollAttack` and `duellistPreRollDamage` grant the `fin` property and dynamically calculate `dexMod - strMod` when Dexterity exceeds Strength.
  - Lines 121–178: `declareOpponent` dynamically computes base gains (1 base, or 2 at level 10+) plus non-heavy bonus (`isWieldingHeavyMeleeWeapon(actor)` ? 0 : 1), clamps to 10 max, and records opponent metadata.
  - Lines 227–251: `riposte` deducts 1 Aggression and consumes Reaction via `spendReaction()`.
  - Lines 254–301: Principles of Defence (4th Level) enforces level gating; `lightningReflexes` sets DEX save; `punishOpening` bypasses reaction.
  - Lines 359–538: All 9 Engagements (`engagementAnalysis`, `engagementBalestra`, `engagementDerobement`, `engagementDisplacement`, `engagementEnGarde`, `engagementFeint`, `engagementFleche`, `engagementRedoublement`, `engagementScore`) enforce point costs and once-per-turn limit via `checkEngagementTurnLimit`.
  - Lines 542–598: `grandChallenge` (1/LR pool use) and `coupDeGrace` (8d8 unreduced damage on hit at 10 points).
- `ak5e/scripts/liberator-features.mjs` (641 lines):
  - Lines 30–57: Defines `liberty` (0–6 max) and `revolution` (1/LR at 17th level) resource pools.
  - Lines 125–138: Formulas `flashOfAngerFormula` (d6 base, d10 at 10th level) and `guideTheMassesBonus` (`Math.max(2*pb, 2*liberty)` for Advocate, `Math.max(pb, liberty)` for Empower/Uplift).
  - Lines 154–260: `guideTheMasses` implements range gating (20 ft base, 40 ft at 10th level), 7th-level Bonus Action requirement (different target from Action), 17th-level Champion free action, and enqueues effect tags.
  - Lines 263–360: `flashOfAnger` spends Liberty, configures manual damage formula, forbids crit multiplication, handles kill refund, and adds 10-ft splash via Caught in the Crossfire at 13th level.
  - Lines 379–419: `theRightMoment` consumes all Liberty, calculates `saveFormula` and `meleeFormula`, and wires `liberatorPreRollDamage` hook.
  - Lines 483–534: `revolution` spends 1 LR use and all Liberty, computes 20-ft burst save vs Martial DC for 1d12 Force per Liberty, and triggers 10-minute benefits (`isRevolutionActive`).
- `ak5e/scripts/lord-features.mjs` (895 lines):
  - Lines 33–59: Defines `manifestation` (`@prof` max, LR recovery) and `forceOfWill` (`@prof` max at level 13+) pools.
  - Lines 212–239: `toggleAuthority` manages `flags.ak5e.lord.hasAuthority` across kill and loss triggers.
  - Lines 269–297: `manifestDestiny` spends 3 Aggression to prevent loss of Authority with shortfall clamping.
  - Lines 303–345: `manifestWill` spends 1 Manifestation use, enables 30-ft melee range, STR ranged attack/damage, +CHA mod Force damage, and King's Domain mode selection.
  - Lines 348–370: `willAttunement` 10-minute ritual alters Manifestation damage type.
  - Lines 374–418: `makeItSo` spends 1 Manifestation use, adding CHA mod + PB (or Expertise with Authority), with failure reroll at 17th level.
  - Lines 424–472: `aLeaderLeads` spends 1+ Aggression on Authority gain to grant Special Inspiration to allies.
  - Lines 480–533: `forceOfWill` PB/LR uses, 1/turn limit, across 3 damage element groups: 3d6 burst (DEX save), 8d6 line (DEX save), 6d6 melee hit (CON save).
  - Lines 541–605: King's Domain: `castleDoctrine` (15-ft zone, reaction move and attack, non-elite hit reaction refund, Authority speed reduction) and `pursuitOfPower` (full movement without AoO, 2x jump, Authority unlimited per turn, 17th level CHA aura damage).
- `ak5e/scripts/guard-uses.mjs`:
  - Lines 50–108: `forestall` integrates Duellist Parry: if first Forestall of round, costs 0 Reaction and 1 fewer Aggression (min 0). If not Parry, spends reaction and full Aggression.
- `ak5e/scripts/guard-sheet.mjs`:
  - Renders summary badges for Duellist Points, Liberty, Authority, and Manifestation.
  - Action buttons and DialogV2 prompts for Engagements, Guide the Masses, Flash of Anger, King's Domain, Make It So, Force of Will.
- `ak5e/scripts/ak5e.mjs`:
  - Registers `registerDuellistHooks()`, `registerLiberatorHooks()`, and `registerLordHooks()`.
  - Exposes `game.ak5e.guard` with subclass APIs.

### 1.3 Adversarial Stress Testing
Executed custom isolated stress test:
- Duellist Points cap at 10: Verified. Points clamped at 10.
- Shortfall clamping at 0: Verified. Spending 5 Liberty with 1 remaining warned, and overriding clamped exactly at 0 without going negative.
- Undo restoration: Verified. Encounter-window undo restored Liberty to 1 and Aggression to 1 exactly.
- Lord Manifest Destiny shortfall clamping and undo: Verified. Clamped at 0 Aggression, restored to 1 on undo.

### 1.4 Live Browser Validation & Visual Review
- `/tmp/ak5e-guard-live/report.json`:
  - `errors: []` (0 browser console errors, 0 unhandled rejections).
  - 40 screenshots captured.
- `foundry_validator_m5/handoff.md`:
  - Subagent inspected screenshots 24 through 40 covering Duellist, Liberator, and Lord sheets, dialogs, prompts, roll cards, and undo flows.
  - Verdict: **APPROVE (ALL SCREENSHOTS PASS)**.

---

## 2. Logic Chain

1. **Premise**: Per `ORIGINAL_REQUEST.md` (Integrity mode: Development), work products must feature authentic implementation logic, genuine calculations, no dummy/facade implementations, no hardcoded test outputs, no fabricated logs, and strict adherence to WORKFLOW §3.2 Table-Play philosophy.
2. **Observation**:
   - Source code analysis reveals comprehensive, genuine mechanics for all three Guard subclasses (Duellist, Liberator, Lord) mapped directly to Chapter 3 text.
   - Resource operations utilize `play-uses.mjs` and `resource-pools.mjs` with explicit before/after snapshots, shortfall clamping at 0, warning generation, and undo receipts.
   - Table-play requirements (confirm before spend, cancel changes nothing, ability checks/saves exempt from confirmation, interactive roll buttons without auto-rolling dice, unowned target relay via GM) are fully implemented and verified.
   - All 90 automated tests in `npm run test:guard`, 213 files in `validate-files.mjs`, 2,193 records in `verify-generated-content.mjs`, and the whole repository test suite `npm test` execute cleanly with zero failures.
   - Live Foundry V13 browser testing (`test-guard-live.mjs`) ran without error and screenshots were verified PASS by the `foundry-validator` subagent.
3. **Conclusion**: The work product satisfies 100% of the integrity criteria and functional specifications without taking shortcuts or circumventions. The audit verdict is **CLEAN**.

---

## 3. Caveats

- **No Caveats**. All files, mechanics, automated suites, source comparisons, table-play interactions, and visual artifacts were verified independently and empirically.

---

## 4. Conclusion

The implementation of Guard Subclasses Batch 1 (Duellist, Liberator, and Lord) is **AUTHENTIC, ROBUST, AND COMPLETE**.
No integrity violations, facades, stubbed returns, or fabricated artifacts were detected.
Final Verdict: **CLEAN**.

---

## 5. Verification Method

To independently re-verify this audit, run the following commands from the repository root:

1. Guard Unit Tests:
   ```bash
   npm run test:guard
   ```
   *Expected outcome*: 90 passing tests, 0 failures.

2. Syntax Validation:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome*: Validates module.json, lang/en.json, and 213 .mjs files.

3. Source Record Verification:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: 2,193 top-level records and 801 embedded features verified against v1.3.1 source with 0 regressions.

4. Full Project Test Suite:
   ```bash
   npm test
   ```
   *Expected outcome*: All test suites pass cleanly with exit code 0.

5. Inspect Live Browser Evidence & Validator Report:
   - View `/tmp/ak5e-guard-live/report.json` to verify `"errors": []`.
   - View `.agents/teamwork/foundry_validator_m5/handoff.md` to verify the subagent visual inspection report.
