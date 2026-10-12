# Handoff Report — Milestone M6: Polish & Documentation

## 1. Observation

- **Cosmetic badge spacing in `ak5e/scripts/guard-sheet.mjs` (line 55):**
  Prior to modification, line 55 contained:
  ```javascript
  ${isLord(actor) ? `<span class="ak5e-pool-badge">Authority: ${hasAuthority(actor) ? "Active" : "Inactive"}</span><span class="ak5e-pool-badge">Manifestation: ${getPool(actor, "manifestation")?.value ?? 0}/${getPool(actor, "manifestation")?.max ?? 2}</span>` : ""}
  ```
  The Authority badge and Manifestation badge rendered adjacent `<span>` elements without whitespace or separation, causing them to run together visually on the sheet.
  After modification, line 55 is:
  ```javascript
  ${isLord(actor) ? `<span class="ak5e-pool-badge">Authority: ${hasAuthority(actor) ? "Active" : "Inactive"}</span> · <span class="ak5e-pool-badge">Manifestation: ${getPool(actor, "manifestation")?.value ?? 0}/${getPool(actor, "manifestation")?.max ?? 2}</span>` : ""}
  ```
  Inserting ` · ` ensures clear visual separation consistent with the rest of the status line.

- **`TODO.md` status:**
  - Added new section `### Guard Subclasses Batch 1: Duellist, Liberator, and Lord (0.6.0, 2026-10-12)` detailing the Duellist, Liberator, and Lord subclass implementations, unit test suites (90 passing tests across the Guard suite), and live Playwright browser verification on port 30175 with 40 screenshots.
  - Updated backlog items under `#### Duellist — L`, `#### Liberator — L`, and `#### Lord — L` to checked (`[x]`) with updated evidence references pointing to unit tests and live test browser screenshots.

- **`ak5e/DECISIONS.md` documentation:**
  - Appended section `## Guard Subclasses Batch 1: Duellist, Liberator, and Lord (0.6.0, 2026-10-12)` detailing source citations (Ch. 3 L2739–2845 for Duellist, L2938–3039 for Liberator, L3013–3248 for Lord) and mechanics:
    - **Duellist:** Duelling Blades finesse property for Greatswords/Polearms via `dnd5e.preRollAttack` hook; Rules of Engagement points ledger (0–10 max, declaration/turn-start/damage conditions, level 10 +2 upgrade, non-heavy weapon hit bonus); Parry reducing 1st Forestall/round reaction cost to 0 and -1 Aggression; 9 Engagements (Analysis, Balestra, Derobement, Displacement, En Garde, Feint, Fleche, Redoublement, Score); Grand Challenge (Corps à Corps, Displacement resistance, Coup de Grâce unreduced 8d8 damage); Master Duellist retention.
    - **Liberator:** Liberty pool (0–6 max, combat generation at turn end via inaction or Guide the Masses); Guide the Masses scaling (Advocate max(2*PB, 2*Liberty), Empower/Uplift max(PB, Liberty), 20 ft / 40 ft range, 7th level Bonus Action, 17th level free Champion of the Worthy); Flash of Anger melee damage rider (d6/d10, no crit multiplication, 1 Liberty kill refund, 13th Force/Arts and 10-ft splash); Rising Tide charging methods; Praxis Face Me Compelled Duel with Martial DC; Révolution (17th) burst damage and 10-min benefits (Champion of the Worthy, Shield of Belief, Time to Act).
    - **Lord:** Authority state (`flags.ak5e.lord.hasAuthority`, gain triggers [Elite/Leader kill, 2+ kills, 1-shot full HP kill], loss triggers [0 HP, end-of-turn save affliction, Prone at end of turn, Initiative], Manifest Destiny to retain Authority); Overruled (INT/WIS/CHA saves at start and end of turn); turn-start 1d8 THP; Manifestation pool (`@prof` uses, Long Rest recovery, 1-min duration, melee Range 30/-, STR ranged, +CHA damage); Will Attunement ritual; Authority Marks (+1d6 damage on opposite attack, 10-ft splash at 17th); King's Domain modes (Castle Doctrine reaction move+attack+refund, Pursuit of Power no AoO full move); By Lordly Decree (Make It So CHA+PB or CHA+2*PB Expertise with Authority, reroll at 17th; A Leader Leads Special Inspiration); Force of Will (3 element groups: 3d6 burst, 8d6 line, 6d6 melee hit); Divine Right capstone.
    - **WORKFLOW §3.2 Table-Play Compliance:** Confirm dialogs before spend, cancellation changes nothing, ability checks/saves require no confirmation, no auto-rolled dice, resource shortfalls warn with "Use anyway" and clamp at 0, unowned targets relay via GM, and full encounter-window undo receipts under `flags.ak5e.guardUses.undo`.

- **Test & validation execution:**
  - `npm run test:guard`: Exited code 0 with 90 passed tests, 0 failed, 0 skipped.
  - `node ak5e/tools/validate-files.mjs`: Exited code 0; validated `module.json`, `lang/en.json`, and 213 `.mjs` files with 0 syntax errors.
  - `node ak5e/tools/verify-generated-content.mjs`: Exited code 0; verified 2193 top-level and 801 embedded records against v1.3.1 source with 0 regressions.
  - Live test artifacts: Verified `/tmp/ak5e-guard-live/report.json` on port 30175 with `errors: []` and 40 captured screenshots (`01-crusher-sheet-features-tab.png` through `40-guard-subclasses-undo-flow.png`).

## 2. Logic Chain

1. Step 1: Dispatched instructions assigned ownership of `ak5e/scripts/guard-sheet.mjs` (line 55 separator fix), `TODO.md` (progress update), and `ak5e/DECISIONS.md` (rules documentation).
2. Step 2: Inspection of `ak5e/scripts/guard-sheet.mjs` confirmed line 55 lacked separation between Authority and Manifestation spans. Inserting ` · ` corrected the cosmetic defect with minimal change.
3. Step 3: Inspection of `TODO.md` revealed Guard Subclasses Batch 1 had completed implementation (90 tests across the Guard suite, 40 screenshots from live browser testing), but the top section and subclass checklist entries were still unrecorded. Updating these aligns project documentation with the repository state.
4. Step 4: Documentation in `ak5e/DECISIONS.md` was drafted according to exact source citations and requirements, covering all rulings, pool lifecycles, and table-play rules.
5. Step 5: Execution of `npm run test:guard`, `node ak5e/tools/validate-files.mjs`, and `node ak5e/tools/verify-generated-content.mjs` confirmed 100% passing tests, valid syntax across all project JavaScript/ESM files, and zero content regressions.

## 3. Caveats

- No caveats. All 3 assigned files were updated strictly within allowed boundaries, and all tests passed without warning or error.

## 4. Conclusion

Milestone M6: Polish & Documentation is complete and fully verified.
- Spacing separator on line 55 of `ak5e/scripts/guard-sheet.mjs` is in place.
- Progress for Guard Subclasses Batch 1 is accurately recorded in `TODO.md`.
- Rulings and mapping decisions are comprehensively documented in `ak5e/DECISIONS.md`.
- All verification commands succeed cleanly.

## 5. Verification Method

To independently verify this milestone:
1. Check git diff for touched files:
   ```bash
   git diff ak5e/scripts/guard-sheet.mjs TODO.md ak5e/DECISIONS.md
   ```
2. Run Guard test suite:
   ```bash
   npm run test:guard
   ```
   *Expected result:* 90 tests pass, 0 fail.
3. Run file syntax validator:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected result:* Validated module.json, lang/en.json, and 213 .mjs files.
4. Run generated content regression verifier:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected result:* Verified all generated AK5e Chapter 1–6 records with 0 regressions.
5. Invalidation conditions: Any test failure in `npm run test:guard`, syntax error in `validate-files.mjs`, or missing documentation in `TODO.md`/`DECISIONS.md`.
