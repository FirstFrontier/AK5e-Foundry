# Test Infrastructure Report: Guard Subclasses Testing & Validation

**Author:** Test Explorer Subagent  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_test_infra/`  
**Target:** Batch 1 Guard Subclasses (Duellist, Liberator, Lord) Testing Infrastructure  
**Date:** 2026-10-12  

---

## 1. Observation

### 1.1 Existing Test Scripts and Configuration (`package.json`)
In `package.json` (lines 11–28):
- Current Guard test script:
  ```json
  "test:guard": "node --test ak5e/test/guard-*.test.mjs ak5e/test/centurion.test.mjs ak5e/test/crusher.test.mjs ak5e/test/instructor.test.mjs ak5e/test/artsblade.test.mjs ak5e/test/brawler.test.mjs"
  ```
- Executing `npm run test:guard` yielded:
  ```
  ✔ Artsblade identification and formula scaling (1.446998ms)
  ...
  ✔ Once More Unto The Breach (17th) spends 1 use of breach pool for mass instruction (0.716896ms)
  ℹ tests 58
  ℹ suites 0
  ℹ pass 58
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 225.027302
  ```
- Static file validation script:
  ```json
  "check:files": "node ak5e/tools/validate-files.mjs"
  ```
  Running `node ak5e/tools/validate-files.mjs` exited 0:
  `Validated module.json, lang/en.json, and 207 .mjs files.`
- Content verification script:
  ```json
  "test:content": "node ak5e/tools/verify-generated-content.mjs && node --test ak5e/test/enhanced-weapons.test.mjs"
  ```
  Running `node ak5e/tools/verify-generated-content.mjs` exited 0:
  `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source. Top-level records: 2193; Chapter 6 embedded features: 801.`

### 1.2 Unit Test Architecture and Fixtures
In `ak5e/test/guard-fixture.mjs` (lines 11–141):
- `guardFixture({ level = 5, branch = null, aggression = 4, unrelenting = 1, enabled = true, owner = true } = {})`:
  - Returns a mock character Actor with `id: "guard1"`, `uuid: "Actor.guard1"`, `isOwner: true`.
  - Sets up flags: `flags.ak5e.guard: { version: 1, enabled, operations: [], events: [], uses: {}, rulings: {} }`.
  - Sets up resource pools: `flags.ak5e.resourcePools: { aggression: { value, max: 4 }, unrelenting: { value, max: 1 } }`.
  - Sets up ability scores: `str: 18 (mod 4)`, `dex: 14 (mod 2)`, `con: 16 (mod 3)`, `cha: 12 (mod 1)`.
  - Sets up items: Guard class Item (`chapterThreeId: "class-guard"`), and if `branch` is provided, a subclass Item (`chapterThreeId: "subclass-guard-${branch}"`).
  - Implements `update(changes)` pushing to `this.writes` and mutates paths.
  - Implements `createEmbeddedDocuments(type, data)` generating documents with `getFlag`, `delete`, and `update`.
- `world(combat = null)`:
  - Stubs `globalThis.game` (user, combat, time, settings, i18n, actors, scenes, messages).
  - Stubs `globalThis.fromUuidSync`, `globalThis.fromUuid`.
  - Stubs `globalThis.foundry.utils.randomID`, `flattenObject`, `hasProperty`.
  - Stubs `globalThis.ui.notifications`.
  - Stubs `globalThis.ChatMessage.implementation.create`.
  - Stubs `globalThis.Hooks.on`, `Hooks.off`.
- Pattern in existing subclass tests (`centurion.test.mjs`, `crusher.test.mjs`, `instructor.test.mjs`, `artsblade.test.mjs`, `brawler.test.mjs`):
  - Imports `test` from `node:test` and `assert` from `node:assert/strict`.
  - Sets up world via `setupWorld()` which initializes `world()` and calls `register<Subclass>Hooks()`.
  - Wraps `guardUses.command()`:
    ```javascript
    const use = (actor, command, data = {}, id = "cmd-1") =>
      guardUses.command(actor, command, { confirmed: true, ...data }, id);
    ```
  - Inspects receipts: `guardUses.receipt(actor, id)`.
  - Tests negative warning cases:
    ```javascript
    await assert.rejects(use(actor, "command", invalidData), error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "expectedWarningId"));
      return true;
    });
    ```
  - Tests warning override ("Use anyway"):
    ```javascript
    const res = await use(actor, "command", { ...data, overrides: ["expectedWarningId"] });
    ```
  - Tests undo: `guardUses.undo(actor, id)`.

### 1.3 Live Browser Test Harness (`ak5e/tools/test-guard-live.mjs`)
In `ak5e/tools/test-guard-live.mjs`:
- Uses `launchTestBrowser(chromium, options)` from `ak5e/tools/test-browser.mjs` adhering to WORKFLOW.md §5.3.
- Environment variables:
  - `process.env.AK5E_PLAYWRIGHT ?? "playwright"` (resolved to `/tmp/frontier-browser-check/node_modules/playwright/index.mjs`)
  - `process.env.AK5E_PORT ?? "30171"` (overridden to `30175` by shell runner)
  - `process.env.AK5E_GUARD_OUTPUT ?? "/tmp/ak5e-guard-live"`
  - `process.env.AK5E_CHROMIUM` (optional path to Chromium binary, e.g. `/snap/bin/chromium`)
- Session orchestration:
  - Joins as user `"Gamemaster"` via `page.goto("http://127.0.0.1:${port}/join")`.
  - Closes any `UserConfig` popup dialogs.
  - Verifies or activates `ak5e` module in `game.settings.set("core", "moduleConfiguration", { ak5e: true })` and reloads.
  - Awaits `globalThis.game?.ready && globalThis.game.ak5e?.guard`.
  - Creates or retrieves Actors (`Crusher`, `Centurion`, `Instructor`, `Artsblade`, `Brawler`), embedding Guard class and subclass Items and initializing flags.
  - Interacts with:
    - Actor sheets (`actor.sheet.render(true)`, switches to Features tab).
    - Guard Controls dialog (`game.ak5e.guard.open(actor)`, element `.ak5e-guard-dialog`).
    - Action buttons (`button[data-guard-cmd="..."]`).
    - ApplicationV2 prompt dialogs (`dialog:has(select[name="..."]) button[data-action="ok"]`).
    - Chat message cards (`#chat-log .ak5e-play-use-controls button` for dice rolls).
    - Undo flow (`button[data-guard-act="__undo"]`, selects from `.ak5e-play-use-choice`, confirms).
  - Screenshots are captured with `await page.screenshot({ path: fullPath, fullPage: false })` and recorded in `report.screenshots`.
  - Outputs `report.json` with `{ world: "standard-test", port, errors: [], screenshots: [...] }`.

### 1.4 Live Server Shell Runner (`/tmp/run-guard-live.sh`)
In `/tmp/run-guard-live.sh` (lines 1–62):
- Environment variables:
  ```bash
  export AK5E_FOUNDRY_PATH=/home/patch/FoundryV13
  export AK5E_TEST_DATA=/tmp/ak5e-guard-test-data
  export AK5E_TEST_PORT=30175
  export AK5E_TEST_OUTPUT=/tmp/ak5e-guard-live
  export AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs
  ```
- Server launch:
  ```bash
  node "$AK5E_FOUNDRY_PATH/main.js" \
    --dataPath="$AK5E_TEST_DATA" --port="$AK5E_TEST_PORT" \
    --hostname=127.0.0.1 --world=standard-test --noupnp \
    > "$AK5E_TEST_OUTPUT/server.log" 2>&1 &
  AK5E_TEST_PID=$!
  ```
- Readiness polling: loops up to 60 times checking `curl -s "http://127.0.0.1:$AK5E_TEST_PORT/join"`.
- Clean teardown: bash `trap cleanup EXIT INT TERM` sends `SIGTERM` to `AK5E_TEST_PID`, waits up to 10s for termination, and asserts `ss -H -ltn "sport = :$AK5E_TEST_PORT"` is clear.

### 1.5 Clean `standard-test` Fixture Location
- Located in `/tmp/ak5e-standard-test/Data/worlds/standard-test` (Foundry 13.351, D&D5e 5.3.3).
- To initialize a fresh copy before running tests:
  ```bash
  rm -rf /tmp/ak5e-guard-test-data
  cp -r /tmp/ak5e-standard-test /tmp/ak5e-guard-test-data
  node ak5e/tools/install-for-testing.mjs --data-path /tmp/ak5e-guard-test-data --foundry-path /home/patch/FoundryV13 --port 30175
  ```

---

## 2. Logic Chain

### 2.1 From Requirements to Unit Test Authoring
1. `ORIGINAL_REQUEST.md` R6 mandates three new test files: `ak5e/test/duellist.test.mjs`, `ak5e/test/liberator.test.mjs`, and `ak5e/test/lord.test.mjs`.
2. Based on existing tests (`centurion.test.mjs`, `crusher.test.mjs`, `instructor.test.mjs`, `artsblade.test.mjs`, `brawler.test.mjs`), each new test file must:
   - Import `guardFixture` and `world` from `./guard-fixture.mjs`.
   - Import feature functions and hook registrators from the corresponding script in `ak5e/scripts/` (e.g. `duellist-features.mjs`, `liberator-features.mjs`, `lord-features.mjs`).
   - Import `guardUses` from `../scripts/guard-uses.mjs`.
   - Setup world with `setupWorld()` registering hooks and pools.
   - Author comprehensive test suites covering:
     - Identification helper (`isDuellist`, `isLiberator`, `isLord`).
     - Resource pool definitions, initial values, and recovery (`aggression`, `unrelenting`, `duellistPoints`, `liberty`, `manifestation`, `revolution`, etc.).
     - Feature calculation helpers (formulas, DC, scaling steps).
     - Command plans executed via `guardUses.command(actor, cmd, data, id)`.
     - Warning cases (shortfalls, level requirements, reaction unavailability) verifying `AK5eWarnings` errors.
     - "Use anyway" overrides verifying clamped resources (to 0) and public chat card shortfall indicators.
     - Undo receipts in `flags.ak5e.guardUses` and state restoration via `guardUses.undo(actor, id)`.
     - Pre-roll and attack/damage hooks.

### 2.2 Concrete Blueprint for `ak5e/test/duellist.test.mjs`
To be implemented by the test implementer:
- **Suite 1: Identification & Duelling Blades**
  - `isDuellist(actor)` is `true` for branch `"duellist"`, `false` for other branches.
  - Greatsword (`two`, `hvy`) and Polearm (Halberd, Pike, Glaive) gain the `finesse` property under Duelling Blades; non-polearm/greatsword weapons are untouched.
- **Suite 2: Rules of Engagement & Points Ledger**
  - Command `rulesOfEngagement` (or `declareOpponent`): Bonus Action, targets opponent, grants +1 Duellist Point (max 10).
  - At level 10+, declaration awards +2 Duellist Points.
  - Turn-start ledger conditions: +1 (+2 at 10th) if damaged opponent, +1 (+2 at 10th) if not damaged by opponent.
  - Clamping: Duellist points never exceed 10.
- **Suite 3: Parry & Riposte**
  - `parry`: First Forestall per round costs 0 reaction (spends 1 Aggression). Subsequent Forestalls cost 1 reaction.
  - `riposte`: Reaction on missed melee attack against Duellist -> Attack of Opportunity; spends 1 Aggression.
- **Suite 4: Principles of Defence (4th Level)**
  - Gated to Guard level >= 4 (warns below level 4).
  - `everyVictory`: +1 Aggression gained when declared opponent is defeated or surrenders.
  - `lightningReflexes`: Reaction to seen effect; spends 1 Aggression; DEX saving throw.
  - `punishEveryOpening`: On successful save against seen effect, free Riposte without spending a reaction.
- **Suite 5: Engagements (9 Options)**
  - Test all 9 options with point costs:
    1. `analysis`: 0 points.
    2. `balestra`: 2 points.
    3. `derobement`: 1 point.
    4. `displacement`: 1 point.
    5. `enGarde`: 1 point.
    6. `feint`: 1 point.
    7. `fleche`: 2 points.
    8. `redoublement`: 1 point.
    9. `score`: 1 point.
  - Spends points from `flags.ak5e.duellist.points`; rejects if points insufficient unless overridden with "Use anyway", clamping at 0.
- **Suite 6: Grand Challenge (13th Level)**
  - Gated to level >= 13; spends 1 use of `grandChallenge` pool (1/Long Rest).
  - Sets 1-minute state.
  - `corpsACorps`: AoO when opponent attacks creatures other than Duellist.
  - `displacement`: Damage resistance against non-opponent attacks.
  - `coupDeGrace`: Slashing/Piercing unreduced 8d8 damage when Duellist points reach 10.
- **Suite 7: Master Duellist (17th Level)**
  - Gated to level >= 17.
  - Retains Duellist points when opponent dies/surrenders.
  - Declaration of opponent costs 0 actions (free action).
- **Suite 8: Reversibility & Receipts**
  - Verifies receipts under `guardUses.receipt(actor, id)` and undo restoration.

### 2.3 Concrete Blueprint for `ak5e/test/liberator.test.mjs`
To be implemented by the test implementer:
- **Suite 1: Identification & Liberty Pool**
  - `isLiberator(actor)` returns `true` for branch `"liberator"`.
  - `liberty` pool initialized with max 6, min 0.
  - Combat turn end generates 1 Liberty if no attack/cast/skill was used.
- **Suite 2: Guide the Masses**
  - Command `guideTheMasses`: Action (or Bonus Action at 7th level) targeting ally within 20 ft (40 ft at 10th level).
  - Out of range warning if ally is > 20 ft (> 40 ft at 10th).
  - Three modes:
    1. `advocate`: Bonus healing = `Math.max(2 * pb, 2 * liberty)`.
    2. `empower`: Damage reduction = `Math.max(pb, liberty)`.
    3. `uplift`: Bonus damage on next hit = `Math.max(pb, liberty)`.
  - Generates/refills 1 Liberty upon use.
- **Suite 3: Righteous Outburst**
  - `flashOfAnger`: Expends X Liberty on melee hit for `Xd6` bonus damage (scales to `Xd10` at 10th level).
  - Caught in the Crossfire (13th level): Damage becomes Force damage (or chosen Skill damage type) and creates 10-ft splash.
  - Kill refund: If target reduced to 0 HP, refunds 1 Liberty.
  - `theRightMoment`: Consumes all current Liberty on Operator Skill activation for bonus damage.
- **Suite 4: Rising Tide (4th Level)**
  - Operator Skills count as Automatic, Offensive, and Defensive charging for skill synergy.
- **Suite 5: Praxis (10th Level)**
  - `faceMe`: Press the Attack command spending 2 Aggression as Bonus Action; forces Compelled Duel save vs Martial DC (`martialDC(actor)`).
- **Suite 6: Révolution (17th Level)**
  - `revolution`: 1/Long Rest Action (`revolution` pool).
  - 20-ft burst DEX save vs Martial DC; deals `1d12` Force damage per Liberty spent.
  - `championOfTheWorthy`: Free Guide the Masses without action spend.
  - `shieldOfBelief`: Turn start grants Temporary HP equal to Guard level (`actor.system.attributes.hp.temp = guardLevel(actor)`).
  - `timeToAct`: Grants +1 additional Liberty on gain or refund.
- **Suite 7: Table-Play & Undo**
  - Warning on Liberty shortfall, clamps at 0.
  - Undo restores spent Liberty and Aggression cleanly.

### 2.4 Concrete Blueprint for `ak5e/test/lord.test.mjs`
To be implemented by the test implementer:
- **Suite 1: Identification & Authority State**
  - `isLord(actor)` is `true` for branch `"lord"`.
  - Authority flag: `flags.ak5e.lord.hasAuthority` (boolean).
  - Turn start with Authority grants `1d8` Temporary HP roll formula.
  - `overruled`: INT, WIS, and CHA saves at both start and end of turn.
- **Suite 2: Authority Acquisition & Loss**
  - Gain Authority conditions:
    - Killing an Elite or Leader damaged since last turn.
    - 2+ kills in a single turn.
    - 1-shot full HP kill.
  - Lose Authority conditions:
    - Reduced to 0 HP.
    - End-of-turn save affliction.
    - Prone at end of turn.
    - Initiative rolled.
  - `manifestDestiny`: Press the Attack spending 3 Aggression to prevent loss of Authority.
- **Suite 3: Manifest Will**
  - `manifestWill`: Spends 1 use of `manifestation` pool (max = `@prof`, Long Rest recovery).
  - Active duration 1 minute.
  - Weapon modifications: Melee weapons gain Range 30/-, use STR for ranged attack and damage rolls, deal bonus CHA mod Force damage.
  - `willAttunement`: 10-minute ritual to swap Manifestation bonus damage type to an Operator Skill type.
  - Authority bonus: Ranged attacks apply Ranged mark, Melee attacks apply Melee mark; attacking a marked target with the opposite attack deals +1d6 bonus damage (+1d6 with 10-ft splash at 17th level).
- **Suite 4: King's Domain (4th Level)**
  - Activated during Manifestation; choice between two modes:
    1. `castleDoctrine`: 15-ft zone. Reaction allows moving half speed and making a melee attack. Non-elite hit refunds reaction. Authority reduces target speed by half (or 0 with WIS save at 17th).
    2. `pursuitOfPower`: Melee hit allows full movement without provoking AoO, doubles jump distance. Authority removes once-per-turn limitation. Adjacent foes take passive CHA damage at 17th level.
- **Suite 5: By Lordly Decree (10th Level)**
  - `makeItSo`: Spends 1 Manifestation use to add bonus to any d20 roll:
    - Base: CHA mod + Proficiency (`chaMod + pb`).
    - With Authority: CHA mod + Expertise (`chaMod + 2 * pb`).
    - At 17th level: Allows 1 reroll on failure.
  - `aLeaderLeads`: Press the Attack spending 1+ Aggression to grant Special Inspiration to allies.
- **Suite 6: Force of Will (13th Level)**
  - Pool: `forceOfWill` (PB uses / Long Rest), limited to 1/turn.
  - Three distinct area/damage profiles:
    1. Fire / Psychic / Force / Thunder: 10-ft burst, 3d6 DEX save.
    2. Bludgeoning / Piercing / Slashing / Radiant: 50-ft line, 8d6 DEX save.
    3. Acid / Cold / Lightning / Necrotic / Poison: Melee hit rider, 6d6 CON save.
- **Suite 7: Table-Play & Undo**
  - Shortfall warnings for Aggression and Manifestation uses.
  - Reversible receipts restoring prior Authority state, Temp HP, and pool values.

### 2.5 Updating `package.json`
`package.json` line 22 must be updated to append the 3 test files:
```json
"test:guard": "node --test ak5e/test/guard-*.test.mjs ak5e/test/centurion.test.mjs ak5e/test/crusher.test.mjs ak5e/test/instructor.test.mjs ak5e/test/artsblade.test.mjs ak5e/test/brawler.test.mjs ak5e/test/duellist.test.mjs ak5e/test/liberator.test.mjs ak5e/test/lord.test.mjs"
```

### 2.6 Expanding `ak5e/tools/test-guard-live.mjs`
To validate the new subclasses in the live browser test:
1. Actor setup in `page.evaluate()`:
   - Create `Irene (Duellist)`: Guard level 5, Subclass `Guard: Duellist` (`subclass-guard-duellist`), DEX 18, Rapier/Greatsword, Duellist Points 3.
   - Create `Tequila (Liberator)`: Guard level 5, Subclass `Guard: Liberator` (`subclass-guard-liberator`), STR 16, CHA 16, Liberty 3.
   - Create `SilverAsh (Lord)`: Guard level 5, Subclass `Guard: Lord` (`subclass-guard-lord`), STR 18, CHA 16, Authority `true`, Manifestation uses 3.
2. Interacting and Screenshot Capture:
   - `24-duellist-sheet-features-tab.png`: Irene's sheet features tab (shows Duellist badges/panel).
   - `25-duellist-guard-controls-dialog.png`: Duellist Guard Controls dialog (`openGuardControls`).
   - `26-duellist-engagement-prompt.png`: Engagement selection dialog (e.g., Balestra or Score).
   - `27-duellist-engagement-chat-card.png`: Chat card output for Engagement.
   - `28-liberator-sheet-features-tab.png`: Tequila's sheet features tab (shows Liberty badge).
   - `29-liberator-guard-controls-dialog.png`: Liberator Guard Controls dialog.
   - `30-liberator-guide-the-masses-prompt.png`: Guide the Masses dialog (Advocate/Empower/Uplift).
   - `31-liberator-guide-the-masses-chat-card.png`: Chat card for Guide the Masses.
   - `32-liberator-flash-of-anger-card-awaiting-roll.png`: Flash of Anger card with roll button.
   - `33-liberator-flash-of-anger-card-rolled.png`: Flash of Anger card after clicking Roll button.
   - `34-lord-sheet-features-tab.png`: SilverAsh's sheet features tab (shows Authority and Manifestation badges).
   - `35-lord-guard-controls-dialog.png`: Lord Guard Controls dialog.
   - `36-lord-manifest-will-dialog.png`: Manifest Will mode prompt (King's Domain mode).
   - `37-lord-manifest-will-chat-card.png`: Manifest Will chat card.
   - `38-lord-make-it-so-prompt.png`: Make It So prompt dialog.
   - `39-lord-make-it-so-chat-card.png`: Make It So chat card.
   - `40-guard-subclasses-undo-flow.png`: Undo dialog and card reversing a subclass use.

### 2.7 Executing the Live Foundry Test Runner
To execute the live test runner:
1. Ensure `/tmp/ak5e-guard-test-data` is initialized from `/tmp/ak5e-standard-test`.
2. Run `/tmp/run-guard-live.sh`.
3. The script will:
   - Clean `/tmp/ak5e-guard-live/`.
   - Start Foundry V13 on port 30175 with `--world=standard-test`.
   - Poll HTTP readiness on port 30175.
   - Execute `node ak5e/tools/test-guard-live.mjs`.
   - Safely stop Foundry via trap cleanup and verify port 30175 is closed.
   - Write `/tmp/ak5e-guard-live/report.json` containing screenshots and 0 errors.

### 2.8 Screenshot Review Protocol (AGENTS.md §6.2)
- All screenshot files saved in `/tmp/ak5e-guard-live/*.png` must NOT be loaded directly into the parent agent context.
- Instead, the parent agent delegates the image review task to a `foundry-validator` subagent, supplying:
  - List of absolute file paths.
  - Inspection criteria: missing text/images, text clipping or overflow, dark-theme readability, proper roll buttons rendered (no auto-rolled dice), permissions, and working undo badges.
- The `foundry-validator` subagent opens every single image using its image tool (`view_file` or `view_image`) and produces a written report with:
  - File path.
  - Document/view/state shown.
  - Checks performed.
  - Defects identified with location and suggested cause.
  - Verdict: **PASS / FAIL / UNCERTAIN**.
- Fix-recheck loops remain with the subagent until all screenshots are verified PASS.

---

## 3. Caveats

1. **Hardware Acceleration Limitations (B-004):**
   Headless Mesa Chromium running on this environment uses the `llvmpipe` software renderer with `--enable-gpu` and `--use-angle=gl-egl`. This is an accepted environment limitation; WebGL works cleanly but hardware acceleration is unverified.
2. **Disposable World Isolation:**
   Tests must NEVER run against production Foundry worlds. Only the disposable `standard-test` copy in `/tmp/ak5e-guard-test-data` on port 30175 must be used.
3. **No Implementation Changes by Explorer:**
   In accordance with the read-only mandate, this agent authored no code changes to `package.json`, `ak5e/scripts/`, `ak5e/test/`, or `ak5e/tools/`. The detailed blueprints and commands above are for the implementer and tester subagents.

---

## 4. Conclusion

The testing infrastructure and validation tools for Guard Subclasses (Batch 1: Duellist, Liberator, Lord) are fully mapped, verified, and ready for implementation.
- `package.json`: Expand `"test:guard"` to include `ak5e/test/duellist.test.mjs`, `ak5e/test/liberator.test.mjs`, and `ak5e/test/lord.test.mjs`.
- Static tools: `validate-files.mjs` and `verify-generated-content.mjs` are already operational and must remain 100% green.
- Live test harness: `test-guard-live.mjs` has a clean modular pattern ready to incorporate Irene (Duellist), Tequila (Liberator), and SilverAsh (Lord), exercising all sheet panels, DialogV2 prompts, chat roll buttons, and undo receipts.
- Live runner: `/tmp/run-guard-live.sh` is configured to launch Foundry V13 on port 30175 against clean disposable `standard-test` data with robust process tracking and cleanup traps.
- Screenshot review: Strictly delegated to `foundry-validator` subagent per AGENTS.md §6.2.

---

## 5. Verification Method

Independent verification of the test infrastructure can be executed using the following commands:

1. **Run existing Guard unit tests:**
   ```bash
   npm run test:guard
   ```
   *Expected result:* 58 tests pass with 0 failures.

2. **Run static file and manifest checks:**
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected result:* Exits 0, reporting `Validated module.json, lang/en.json, and 207 .mjs files.`

3. **Run source record integrity checks:**
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected result:* Exits 0, reporting `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.`

4. **Verify live server shell script and environment:**
   ```bash
   bash -n /tmp/run-guard-live.sh
   ```
   *Expected result:* Syntax check passes cleanly.

5. **Verify Playwright installation path:**
   ```bash
   node -e 'import("/tmp/frontier-browser-check/node_modules/playwright/index.mjs").then(() => console.log("Playwright OK"))'
   ```
   *Expected result:* Prints `Playwright OK`.

6. **Post-Implementation Verification (to be run after test authoring):**
   ```bash
   # 1. Run all Guard unit tests including new subclasses
   npm run test:guard

   # 2. Re-verify static files and content
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs

   # 3. Prepare clean standard-test data copy and install module
   rm -rf /tmp/ak5e-guard-test-data
   cp -r /tmp/ak5e-standard-test /tmp/ak5e-guard-test-data
   node ak5e/tools/install-for-testing.mjs --data-path /tmp/ak5e-guard-test-data --foundry-path /home/patch/FoundryV13 --port 30175

   # 4. Execute live browser tests on port 30175
   /tmp/run-guard-live.sh

   # 5. Check report.json
   cat /tmp/ak5e-guard-live/report.json
   ```
