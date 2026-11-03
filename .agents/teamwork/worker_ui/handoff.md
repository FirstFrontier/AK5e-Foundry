# Handoff Report: Milestone M4 — UI & Core Integration

## 1. Observation
- **`ak5e/scripts/guard-rules.mjs`**:
  - `IMPLEMENTED_GUARD_BRANCHES` previously defined as:
    ```js
    export const IMPLEMENTED_GUARD_BRANCHES = Object.freeze(["artsblade", "brawler", "centurion", "crusher", "instructor"]);
    ```
    Updated to:
    ```js
    export const IMPLEMENTED_GUARD_BRANCHES = Object.freeze(["artsblade", "brawler", "centurion", "crusher", "duellist", "instructor", "liberator", "lord"]);
    ```
- **`ak5e/scripts/ak5e.mjs`**:
  - Imported `isDuellist`, `registerDuellistHooks` from `./duellist-features.mjs`.
  - Imported `isLiberator`, `registerLiberatorHooks` from `./liberator-features.mjs`.
  - Imported `isLord`, `registerLordHooks` from `./lord-features.mjs`.
  - Exported predicates on `game.ak5e.guard`: `isDuellist`, `isLiberator`, `isLord`.
  - Registered `registerDuellistHooks()`, `registerLiberatorHooks()`, `registerLordHooks()` within the `ready` hook.
- **`ak5e/scripts/guard-sheet.mjs`**:
  - Imported `flag` from `./guard-rules.mjs`.
  - Imported `isDuellist` from `./duellist-features.mjs`.
  - Imported `isLiberator`, `guideTheMassesBonus` from `./liberator-features.mjs`.
  - Imported `isLord`, `hasAuthority`, `manifestationDamageType`, `forceOfWillCategory` from `./lord-features.mjs`.
  - In `openGuardControls(actor)`:
    - Summary badges:
      - Duellist: `Points: ${points}/10${opponent ? ` (Opponent: ${name})` : ""}`.
      - Liberator: `Liberty: ${liberty}/6`.
      - Lord: `Authority: ${active ? "Active" : "Inactive"}` and `Manifestation: ${value}/${max}`.
    - Dedicated subclass action groups with command buttons:
      - Duellist: `declareOpponent`, `duelTurnStart`, `riposte`, `openEngagement`, `lightningReflexes`, `punishOpening`, `grandChallenge`, `coupDeGrace`.
      - Liberator: `guideTheMasses`, `flashOfAnger`, `theRightMoment`, `faceMe`, `libertyInaction`, `revolution`.
      - Lord: `toggleAuthority`, `manifestDestiny`, `manifestWill`, `willAttunement`, `makeItSo`, `aLeaderLeads`, `forceOfWill`.
  - In `executeGuardDialog(actor, cmd)`:
    - `openEngagement`: DialogV2 prompt to choose among the 9 Engagements (Analysis, Balestra, Derobement, Displacement, En Garde, Feint, Fleche, Redoublement, Score) with costs displayed.
    - `declareOpponent`: DialogV2 prompt to specify opponent identifier/name.
    - `guideTheMasses`: DialogV2 prompt to choose mode (Advocate, Empower, Uplift), target, and displaying exact bonus formulas and calculated bonuses.
    - `flashOfAnger`: DialogV2 prompt to select Liberty expenditure (1 to current), kill refund checkbox, and 13th-level Caught in the Crossfire splash target and damage type options.
    - `manifestWill`: DialogV2 prompt to choose King's Domain mode ("castle" or "pursuit").
    - `makeItSo`: DialogV2 prompt to choose d20 roll type (check, attack, save) and displaying calculated bonus (+CHA+PB or +CHA+2*PB with Authority).
    - `forceOfWill`: DialogV2 prompt to select element group with Martial DC and dice formula displayed, switching attunement if needed.
    - `toggleAuthority`: DialogV2 prompt to select trigger for gain or loss of Authority.
    - `willAttunement`: DialogV2 prompt to select attuned damage type.
    - `aLeaderLeads`: DialogV2 prompt to input Aggression spend and ally target name.
- **`package.json`**:
  - Updated `"test:guard"` script to:
    ```json
    "test:guard": "node --test ak5e/test/guard-*.test.mjs ak5e/test/centurion.test.mjs ak5e/test/crusher.test.mjs ak5e/test/instructor.test.mjs ak5e/test/artsblade.test.mjs ak5e/test/brawler.test.mjs ak5e/test/duellist.test.mjs ak5e/test/liberator.test.mjs ak5e/test/lord.test.mjs",
    ```
- **Test Executions**:
  - `npm run test:guard`: Exited 0 with `tests 90, suites 0, pass 90, fail 0` in 296ms.
  - `node ak5e/tools/validate-files.mjs`: Exited 0 with `Validated module.json, lang/en.json, and 213 .mjs files.`
  - `node ak5e/tools/verify-generated-content.mjs`: Exited 0 with `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source. Top-level records: 2193; Chapter 6 embedded features: 801.`

## 2. Logic Chain
1. Adding `"duellist"`, `"liberator"`, and `"lord"` to `IMPLEMENTED_GUARD_BRANCHES` allows `guardProfile` and other system components to recognize these subclasses as implemented.
2. Importing and exporting `isDuellist`, `isLiberator`, and `isLord` on `game.ak5e.guard` makes predicate helpers globally accessible across Foundry and macros.
3. Registering `registerDuellistHooks()`, `registerLiberatorHooks()`, and `registerLordHooks()` ensures attack/damage hooks and pool initialization run when Foundry becomes ready.
4. Integrating sheet UI badges and action groups provides players and GMs direct access to subclass mechanics via `openGuardControls()`.
5. Wiring `executeGuardDialog()` with `DialogV2` prompts satisfies WORKFLOW.md §3.2 (table-play philosophy, confirm before use, manual control without auto-rolling dice, undoable actions).
6. Updating `package.json` integrates the unit test suites authored in M1, M2, and M3 into the standard test command. All 90 tests pass with zero failures.

## 3. Caveats
- Browser UI rendering inside live Foundry VTT is covered by Milestone M5 live Playwright browser tests. Unit test fixtures use mock actors and LinkeDOM environments.

## 4. Conclusion
Milestone M4: UI & Core Integration is fully implemented, verified, and adheres strictly to repository guidelines and WORKFLOW.md §3.2. All 9 suites and 90 unit tests pass with zero failures. File validation and content verification are clean.

## 5. Verification Method
Run the following verification commands:
```bash
npm run test:guard
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs
```
Expected output:
- `npm run test:guard`: 90 passing tests, 0 failures.
- `node ak5e/tools/validate-files.mjs`: 213 .mjs files validated cleanly.
- `node ak5e/tools/verify-generated-content.mjs`: All records verified against v1.3.1 source.
