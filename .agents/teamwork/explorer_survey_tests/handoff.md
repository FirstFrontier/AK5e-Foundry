# Handoff Report: Test Suites, Validation Scripts, and In-Foundry Live Testing Infrastructure

## 1. Observation

### 1.1 Existing Unit Test Architecture (`ak5e/test/`)
- **Native Test Runner:** The project uses Node.js native test runner via `node --test` (Node >= 22 as specified in `package.json:6`).
- **Imports & Runner Structure:**
  - Tests import `test` from `"node:test"` and `assert` from `"node:assert/strict"` (observed in `ak5e/test/resource-pools.test.mjs:1-2`, `ak5e/test/guard-rules.test.mjs:1-2`, `ak5e/test/guard-features.test.mjs:1-2`, `ak5e/test/operation-kernel.test.mjs:1-2`).
  - Tests run asynchronously with `test("description", async () => { ... })`.
- **Foundry Globals Mocking & Fixtures:**
  - In `ak5e/test/guard-fixture.mjs:11-89` and `defender-fixture.mjs:11-88`, fixtures construct lightweight in-memory Actor and Item POJOs simulating Foundry document behavior:
    - `actor.flags.ak5e`, `actor.system.attributes`, `actor.system.abilities`, `actor.items` (`Map`).
    - Dotted-path updates via `setPath()` / `merge()` (`actor.update(changes)`).
    - Embedded document creation via `actor.createEmbeddedDocuments(type, data)`.
  - In `ak5e/test/guard-fixture.mjs:91-140` and `resource-pools.test.mjs:55-63`:
    - `globalThis.game` with `user`, `combats`, `users.activeGM`, `time`, `i18n`, `settings`.
    - `globalThis.foundry.utils.randomID`, `flattenObject`, `hasProperty`.
    - `globalThis.fromUuidSync` and `globalThis.fromUuid`.
    - `globalThis.ui.notifications.warn`, `error`, `info`.
    - `globalThis.ChatMessage.implementation.create`.
    - `globalThis.Hooks.on`, `Hooks.off`.
- **Resource Pools & Operation Kernel Infrastructure:**
  - `ak5e/scripts/resource-pools.mjs:75-86` defines pool registry mechanics: formula evaluator (arithmetic, `@prof`, `@abilities.cha.mod`, `min`, `max`, `floor`, `ceil`), recovery triggers (`sr`, `lr`, `initiative`, `turnStart`, `turnEnd`, `combatEnd`), clamp-at-zero, over-max handling (`overMax: true` for `lifeSupport`).
  - `ak5e/test/tip-of-the-spear.test.mjs:1-100` tests Vanguard's Tip of the Spear d6 table (`TIP_OUTCOMES` 1–6) and directed choice mechanics.
  - `ak5e/test/standard-bearer.test.mjs` tests Vanguard's Standard Bearer subclass.
  - Currently missing: Core base class rules, features, progression, and uses tests for **Vanguard**, **Supporter**, **Specialist**, and **Medic**.

### 1.2 Static Validation Tools (`ak5e/tools/`)
- **`ak5e/tools/validate-files.mjs`:**
  - Manifest Validation (`lines 11-31`):
    - `manifest.id === "ak5e"`.
    - `manifest.version` matches `/^\d+\.\d+\.\d+$/`.
    - `manifest.compatibility.minimum === "13"` and `manifest.compatibility.verified === "13"`.
    - `manifest.system` deep-equals `["dnd5e"]`.
    - `manifest.relationships.systems` contains `id: "dnd5e"` with `compatibility.minimum` matching `/^5\./`.
    - Verifies file existence for all paths listed under `esmodules`, `styles`, `languages.path`, and `packs.path`.
    - Verifies all pack types are among `["Actor", "Adventure", "Item", "JournalEntry", "RollTable"]`, and packs of type Actor, Adventure, Item explicitly set `"system": "dnd5e"`.
  - Localization Validation (`lines 33-35, 52-59`):
    - `typeof translations.AK5E?.SourceBook === "string"`.
    - Recursively checks all leaf keys in `lang/en.json` via `assertStringLeaves`: every leaf must be a non-empty string.
  - Syntax Checking (`lines 36-42`):
    - Recursively scans `ak5e/` for all `.mjs` files.
    - Executes `node --check <file>` via `spawnSync`.
    - Fails immediately if any `.mjs` file has syntax or parse errors.
- **`ak5e/tools/verify-generated-content.mjs`:**
  - Source Fidelity Validation (`lines 26-45`):
    - Confirms exact record counts for Chapters 1–6 compendia. For Chapter 3 (`lines 31-35`): `reference: 1, class: 8, "class-summon": 8, "class-feature": 232, subclass: 54, "subclass-feature": 483, "operator-skill": 320, "class-option": 350`. (All 8 classes are generated in `ak5e/scripts/chapter-three-content.mjs`).
    - Slug uniqueness and pattern (`lines 46-55`): must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
    - Document fields (`lines 55-65`): `name`, `sourceHeading`, `content`, `rawSource` must exist; no unrendered markup (`{{`, `\page`, `\column`, `<img`, `<script`).
    - Uncovered rules lines check (`lines 67-73`): extracts every line of source text in `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`, confirms zero uncovered lines in `rawSources`.
    - Hit Dice denomination check (`lines 109-113`): extracts `**Hit Dice:** 1d(\d+)` from rawSource, asserts `entry.systemData.hd.denomination === 'd' + sourceDie` (`d8` for Vanguard and Specialist, `d6` for Supporter and Medic).
- **`ak5e/tools/check-generated-content.mjs`:**
  - Executes all builders (`build-chapter-one-content.mjs` through `build-chapter-six-content.mjs`, `build-roll-table-content.mjs`, `build-content-map.mjs`) and verifies that committed generated files match byte-for-byte.

### 1.3 Headless In-Foundry Browser Testing (`ak5e/tools/test-browser.mjs` & Live Scripts)
- **`ak5e/tools/test-browser.mjs` (`lines 11-21`):**
  - Exports `launchTestBrowser(chromium, options = {})`.
  - Filters out caller renderer-override arguments matching `RENDERER_FLAGS = /^--(use-angle|use-gl|use-vulkan|enable-unsafe-swiftshader|disable-gpu)(=|$)/` to prevent disabling GPU or silently falling back to software rasterizers.
  - Launches Chromium with `headless: true`, `channel: "chromium"`, `--enable-gpu`, and `--use-angle=gl-egl` (required for Mesa headless WebGL/GL on Linux).
- **Environment Variables Used:**
  - `AK5E_FOUNDRY_PATH`: Path to Foundry VTT installation directory (e.g. `/home/patch/FoundryV13`).
  - `AK5E_TEST_DATA`: Unique disposable test data root directory in `/tmp` containing `Data/` with independent copies of `worlds/standard-test` and `systems/dnd5e` (e.g. `/tmp/ak5e-base-classes-test-data`).
  - `AK5E_TEST_PORT`: Localhost TCP port for the test server instance (default `30175`).
  - `AK5E_TEST_OUTPUT`: Directory where test evidence, logs, and screenshots are written (e.g. `/tmp/ak5e-base-classes-live`).
  - `AK5E_PLAYWRIGHT`: Path to Playwright ESM entrypoint (`/tmp/frontier-browser-check/node_modules/playwright/index.mjs`).
  - `AK5E_CHROMIUM`: Optional path to custom Chromium executable.
- **Server Lifecycle, Health Check & Process Trap (`/tmp/run-guard-live.sh:10-32`):**
  - Process trap installed before server start:
    ```bash
    cleanup() {
      result=$?
      trap - EXIT
      if [[ -n "${AK5E_TEST_PID:-}" ]] && kill -0 "$AK5E_TEST_PID" 2>/dev/null; then
        args=$(ps -p "$AK5E_TEST_PID" -o args=) || args=
        if [[ "$args" == *"$AK5E_FOUNDRY_PATH/main.js"* && "$args" == *"--dataPath=$AK5E_TEST_DATA"* ]]; then
          kill -TERM "$AK5E_TEST_PID" || result=1
          for attempt in {1..50}; do
            kill -0 "$AK5E_TEST_PID" 2>/dev/null || break
            sleep 0.2
          done
          if kill -0 "$AK5E_TEST_PID" 2>/dev/null; then result=1
          else wait "$AK5E_TEST_PID" 2>/dev/null || true; fi
        else result=1; fi
      fi
      listeners=$(ss -H -ltn "sport = :$AK5E_TEST_PORT") || result=1
      if [[ -n "$listeners" ]]; then result=1; fi
      exit "$result"
    }
    trap cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM
    ```
  - Module sync while server stopped: `npm run install:foundry -- --data-path "$AK5E_TEST_DATA" --foundry-path "$AK5E_FOUNDRY_PATH" --port "$AK5E_TEST_PORT"`.
  - Server start: `node "$AK5E_FOUNDRY_PATH/main.js" --dataPath="$AK5E_TEST_DATA" --port="$AK5E_TEST_PORT" --hostname=127.0.0.1 --world=standard-test --noupnp > "$AK5E_TEST_OUTPUT/server.log" 2>&1 &` tracking `AK5E_TEST_PID=$!`.
  - Health check polling: loops 1..60 testing `curl -s "http://127.0.0.1:$AK5E_TEST_PORT/join"` while checking `kill -0 "$AK5E_TEST_PID"`.
- **Live Test Playwright Patterns (`ak5e/tools/test-guard-live.mjs`):**
  - Session authentication: connects to `/join`, selects user `Gamemaster` (and/or player), clicks `button[name="join"]`, waits for `globalThis.game?.ready && globalThis.canvas?.ready` (timeout 60s).
  - Module verification: evaluates `game.modules.get("ak5e")?.active`; enables and reloads if inactive.
  - Actor creation: creates character Actors via `Actor.create(...)`, attaches class/subclass items via `createEmbeddedDocuments("Item", ...)`, and initializes flags (`flags.ak5e.<class>`).
  - Sheet rendering & navigation: calls `actor.sheet.render(true)`, waits for `.sheet.actor`, clicks `.tabs [data-tab="features"]`.
  - Dialog invocation: opens class controls via `game.ak5e.<class>.open(actor)` or clicks control buttons in the sheet header/badge.
  - Action submission & prompts: selects dropdown options (`select[name="..."]`), clicks dialog confirm (`button[data-action="ok"]`).
  - Chat card inspection & rolls: expands sidebar chat tab (`ui.sidebar.activateTab("chat")`), locates `.ak5e-play-use-controls button` with text "Roll", clicks button, waits for card update. Dice are never auto-rolled.
  - Undo verification: clicks "Undo" button on chat card or opens `__undo` from controls dialog, reviews restoration summary dialog, clicks `button[data-action="undo"]`, and evaluates `receipt.status === "undone"`.
  - Screenshot capture: calls `page.screenshot({ path: fullPath, fullPage: false })`, logs path in `report.screenshots`, outputs `report.json` with `{ world, port, errors, screenshots }`.
  - Clean browser teardown: `try ... finally { await browser.close(); }`.
- **Screenshot Review Delegation (`AGENTS.md §6.2`):**
  - Parents (Gemini/Claude/Codex) must NOT open multiple screenshot images in main context due to context window cost.
  - Delegation is routed to a subagent (`foundry-validator` or Gemini Flash worker assigned the Foundry-validator scope).
  - Parent passes screenshot file paths and inspection criteria (WORKFLOW §5.2 / §8: layout, dark-theme contrast, clipping, missing images/text, roll buttons, undo buttons, permissions).
  - Subagent opens each image using its viewer tool, inspects pixel content, and generates a written visual report with per-image assessment and **PASS / FAIL / UNCERTAIN** verdict.

---

## 2. Logic Chain

1. **Premise 1:** The module must implement Vanguard, Supporter, Specialist, and Medic strictly adhering to AK5e source rules and WORKFLOW §3.2 (no auto-rolled dice, confirm before use, clamp at 0 on override, automatic GM relay for unowned targets, encounter-window undo).
2. **Premise 2:** Existing test patterns (`guard-*.test.mjs`, `defender-*.test.mjs`, `marksman-*.test.mjs`, `caster-*.test.mjs`) demonstrate a 4-part modular structure for class implementations:
   - `<class>-rules.mjs` + `<class>-rules.test.mjs`: Pure mathematical formulas, level tables, DC calculations, profile validation.
   - `<class>-features.mjs` + `<class>-features.test.mjs`: Resource pool definitions, active/reactionary capabilities, warning checks, "Use anyway" overrides.
   - `<class>-progression.mjs` + `<class>-progression.test.mjs`: Idempotent setup, level 1–20 feature grants, saving throws, skills, starting gear, ASI/talent allocation.
   - `<class>-sheet.mjs` / `<class>-uses.mjs`: ActorSheetV2 badges, controls dialogs, chat card roll buttons, undo receipts.
3. **Premise 3:** Static validation checks (`validate-files.mjs`, `verify-generated-content.mjs`, `check-generated-content.mjs`) enforce strict zero-error criteria:
   - Any new `.mjs` files must pass `node --check`.
   - Any new translation keys in `lang/en.json` must be non-empty strings.
   - Source text in `03_chapter_3_character_classes.txt` must remain untouched and completely covered.
   - Hit dice in compendium entries must match source dice (`d8` for Vanguard/Specialist, `d6` for Supporter/Medic).
4. **Premise 4:** Live browser validation must exercise actual UI rendering in Foundry V13 on port 30175 with `launchTestBrowser()`, verifying clean startup, error-free console logs (`report.errors: []`), interactive controls, and screenshot capture.
5. **Deduction:** To achieve full coverage with zero regressions, we must author a comprehensive suite of unit tests, update `package.json` test scripts, maintain static validation compliance, and prepare a headless browser test script (`test-base-classes-live.mjs`) with an automated shell launcher (`/tmp/run-base-classes-live.sh`).

---

## 3. Caveats

- **Source Scope:** This survey focuses on the four base class chassis, rules formulas, level 1–20 progression, and base features (e.g. Tip of the Spear, Provide Aid, Show Your Style/Prowess, Life Support). Individual subclasses (branches) will build upon these base chassis once the foundation is established.
- **Port Availability:** Live test runner scripts default to port `30175`. The cleanup trap checks for listener collisions on this port; ensure no orphaned server is running before launching.
- **Hardware Acceleration:** `launchTestBrowser()` passes `--enable-gpu` and `--use-angle=gl-egl`. On headless Linux servers without physical displays, Mesa software GL via EGL handles WebGL; if WebGL fails, the environment limitation must be reported honestly.

---

## 4. Conclusion & Test Plan

### 4.1 Unit Test Suite Design for Base Classes

Create 4 dedicated fixtures or a unified `ak5e/test/base-classes-fixture.mjs` providing emulated Actor, Item, and World documents.

#### 1. Vanguard Unit Tests (`ak5e/test/vanguard-*.test.mjs`)
- `vanguard-rules.test.mjs`:
  - Hit Dice (1d8), base HP (8 + CON) and higher-level HP (1d8/5 + CON).
  - Proficiencies: Light Armor, Light Shields, Light Melee Weapons, Messenger Kit.
  - Saving Throws: DEX + choice of STR or CHA.
  - Skill options: 3 from Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness.
  - Landstrider: +10 ft Walking Speed, Nimble condition (no AoO on hit).
  - Quick off the Mark: PB added to Initiative.
  - Uncanny Dodge (Level 11): Reaction halves attack damage.
  - Lightspeed (Level 18): Second turn in Round 1 at Initiative - 10.
  - Approaching Storm (Level 20): +floor(Level / 2) damage on Round 1 damage rolls.
- `vanguard-features.test.mjs`:
  - Tip of the Spear d6 table outcomes (integrate with existing `tip-of-the-spear.test.mjs`).
  - Directed Engagement (Level 15): Spend reaction to choose outcome instead of rolling.
  - Warning checks, overrides, clamping at 0, chat cards, and undo receipts.
- `vanguard-progression.test.mjs`:
  - Idempotent Level 1–20 setup and progression.
  - Choice inspection: branch, saving throw choice, skills, tool, starting equipment, ASI allocations, talent selections.
  - Re-running setup produces zero duplicate items or writes.

#### 2. Supporter Unit Tests (`ak5e/test/supporter-*.test.mjs`)
- `supporter-rules.test.mjs`:
  - Hit Dice (1d6), base HP (6 + CON).
  - Proficiencies: Light Armor, Light Shields, Light Melee Weapons, 1 Tool Kit/Vehicle.
  - Saving Throws: Choose 2 from CON, CHA, WIS.
  - Skills: 3 from Arts, Lore, Tech, Insight, Deception, Persuasion.
  - Aid Die progression table: d8 (Levels 1–6), d10 (Levels 7–13), d12 (Levels 14–20).
  - Maximum Aid Dice: Ability modifier choice (INT, WIS, or CHA).
- `supporter-features.test.mjs`:
  - Provide Aid: Bonus Action grants Aid Die to ally within 60 ft (duration 10 minutes).
  - Advanced Aid riders (Level 5): Attack (Crit Range +1), Skill (roll twice, pick), Save (THP = roll + PB), Damage (splash Force damage to nearby creature), Healing (matching THP).
  - Lighten the Load (Level 11): Reaction on ally rolling Aid Die grants Aid Die to another ally without expending pool.
  - Ever Reliable (Level 15): Regain 1 Aid Die at turn start if empty; regain ceil(max / 2) on Short Rest.
  - Self-Supportive (Level 18): Turn start grants personal Aid Die.
  - Will Into Being (Level 20): Add PB to Aid Die roll result.
  - Resource pool registration: `aidDie` pool with Long Rest recovery and Level 15 Short Rest refill.
- `supporter-progression.test.mjs`:
  - Idempotent Level 1–20 setup, ability score dependencies, feature grants.

#### 3. Specialist Unit Tests (`ak5e/test/specialist-*.test.mjs`)
- `specialist-rules.test.mjs`:
  - Hit Dice (1d8), base HP (8 + CON).
  - Proficiencies: Light Armor, Medium Armor, Light Shields, Light Melee, Light Ranged, 2 Tool Kits.
  - Saving Throws: DEX + choice of WIS or CHA.
  - Skills: 3 from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness.
  - Weapon Specialisation choices: Melee Combat (Brawler, Deadly Fighter, Defensive, Duelling, Great Weapon Fighting, Lightly Armed, Spearwall, Two-Weapon Fighting) vs. Ranged Combat (Braced for Action, Close and Personal, Cone of Fire, Deadly Fighter, Ranger, Smooth Operator, Two-Weapon Fighting).
  - Weapon Adept (Level 6): Extra attack + damage reroll (Melee 1–2) or attack reroll (Ranged 1).
  - Weapon Expertise (Level 12): Crit range +1 and Bonus Action 1 Prowess extra damage die (Melee) vs. Advantage extra die and Bonus Action 1 Prowess Advantage (Ranged).
  - Falling Upwards / It's All Skill (Level 17): Spend 3 Prowess as Reaction to auto-succeed saving throw.
  - Weapon Mastery (Level 18): Once/turn +floor(Level / 2) weapon damage (Melee) vs. double PB on attack roll (Ranged).
- `specialist-features.test.mjs`:
  - Prowess pool registration: max = `@prof`, Short/Long Rest recovery (+1).
  - Mark of a Specialist: Spend 1 Prowess on failed proficient skill check to reroll; refund on repeated failure.
  - Table-play confirmations, shortfall clamps, and undo receipts.
- `specialist-progression.test.mjs`:
  - Idempotent Level 1–20 progression and weapon specialisation configuration.

#### 4. Medic Unit Tests (`ak5e/test/medic-*.test.mjs`)
- `medic-rules.test.mjs`:
  - Hit Dice (1d6), base HP (6 + CON).
  - Proficiencies: Light Shields, Light Melee, 1 Tool Kit/Vehicle.
  - Saving Throws: Choose 2 from CON, INT, WIS.
  - Skills: Medicine (automatic) + 2 from Lore, Arts, Tech, Insight, Perception, Persuasion.
  - Medical Expertise (Level 1): Expertise in Medicine.
  - Arts Casting: Healing Arts Special Pool always prepared; AP table progression (3 at Level 1 to 35 at Level 20); Maximum Art Level progression (1 to 9).
  - Spellcasting Ability: Choice of INT or WIS.
  - Self-Defence Protocol (Level 5): 1 Standard Arts Pool (<= 5th level Arts) learned, AP cost reduced by 1 (or 2 at Level 11).
  - Resuscitation (Level 12): 1/Long Rest free Revivify.
  - To Rob the Ferryman (Level 18): Revivify restores 3 × Level HP.
  - Chosen of Asclepius (Level 20): Maximize healing dice.
- `medic-features.test.mjs`:
  - Life Support pool: max steps `{ 1: 20, 2: 35, 4: 50, 6: 65, 8: 80, 10: 95, 12: 110, 14: 125, 16: 140, 18: 155, 20: 170 }`, `overMax: true`, Long Rest recovery.
  - Touch Heal: Action touch creature, spend variable Life Support to heal missing HP.
  - Preserver: Spend 5 Life Support to reroll healing / THP dice.
  - Urgency of Treatment: Spend multiples of 10 Life Support to reduce AP cost by 1 per 10 spent.
  - Target relay for Touch Heal on unowned tokens via GM client without approval gates.
  - Undo receipts restoring exact Life Support and target HP.
- `medic-progression.test.mjs`:
  - Idempotent Level 1–20 progression and spellcasting configuration.

#### 5. `package.json` Test Scripts
Add dedicated test scripts to `package.json`:
- `"test:vanguard": "node --test ak5e/test/vanguard-*.test.mjs ak5e/test/tip-of-the-spear.test.mjs ak5e/test/standard-bearer.test.mjs"`
- `"test:supporter": "node --test ak5e/test/supporter-*.test.mjs"`
- `"test:specialist": "node --test ak5e/test/specialist-*.test.mjs"`
- `"test:medic": "node --test ak5e/test/medic-*.test.mjs"`
- `"test:base-classes": "npm run test:vanguard && npm run test:supporter && npm run test:specialist && npm run test:medic"`
- Update root `"test"` script to include `"test:base-classes"`.

### 4.2 Static Validation Quality Gates
- **Syntax Check:** Every authored module file (`vanguard-*.mjs`, `supporter-*.mjs`, `specialist-*.mjs`, `medic-*.mjs`) must pass `node --check`.
- **File Validation:** `npm run check:files` (`node ak5e/tools/validate-files.mjs`) must validate `module.json`, `lang/en.json`, and all `.mjs` files with 0 warnings/errors.
- **Generated Content:** `npm run test:content` (`node ak5e/tools/verify-generated-content.mjs`) must confirm zero regressions across all 8 classes in Chapter 3 compendia.

### 4.3 Live In-Foundry Browser Testing Plan
- **Orchestration Script (`/tmp/run-base-classes-live.sh`):**
  - Configures environment variables:
    ```bash
    export AK5E_FOUNDRY_PATH=/home/patch/FoundryV13
    export AK5E_TEST_DATA=/tmp/ak5e-base-classes-test-data
    export AK5E_TEST_PORT=30175
    export AK5E_TEST_OUTPUT=/tmp/ak5e-base-classes-live
    export AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs
    ```
  - Initializes trap cleanup, executes `install:foundry`, boots Foundry V13, health-checks port readiness.
  - Executes `node ak5e/tools/test-base-classes-live.mjs`.
- **Live Test Script (`ak5e/tools/test-base-classes-live.mjs`):**
  - Launches Chromium via `launchTestBrowser()`.
  - Authenticates as Gamemaster, checks module activation (`game.modules.get("ak5e")?.active`).
  - Sets up 4 test characters: Vanguard, Supporter, Specialist, Medic.
  - For each class:
    1. Renders sheet (`actor.sheet.render(true)`), captures baseline sheet screenshot.
    2. Opens class controls dialog (`game.ak5e.<class>.open(actor)`), captures controls screenshot.
    3. Triggers core active feature (e.g. Provide Aid, Mark of a Specialist, Touch Heal, Tip of the Spear).
    4. Confirms prompt dialog, captures dialog screenshot.
    5. Submits action, verifies chat card posted with un-evaluated roll buttons, captures card screenshot.
    6. Clicks roll button on chat card, verifies roll evaluated without auto-rolling.
    7. Tests override flow with insufficient resource: overrides warning with "Use anyway", confirms resource clamped at 0 with public shortfall badge on chat card.
    8. Tests undo flow: clicks Undo button on chat card, confirms restoration dialog, verifies actor resources and document modifications fully restored.
  - Generates `${outputDir}/report.json` with `{ world, port, errors: [], screenshots: [...] }`.
- **Screenshot Inspection Protocol:**
  - Delegate all captured screenshots to `foundry-validator` subagent per AGENTS §6.2.
  - Subagent inspects each image for layout clipping, dark-theme contrast, badge placement, roll buttons, and undo buttons.
  - Subagent delivers written report with per-image assessment and **PASS** verdict.

---

## 5. Verification Method

To independently verify this survey and its findings:
1. **Inspect Unit Test Fixtures and Framework:**
   - Run `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs` to confirm the Node test runner and mocking structure.
   - Inspect `ak5e/test/guard-fixture.mjs` and `ak5e/test/tip-of-the-spear.test.mjs`.
2. **Inspect Static Validation Tools:**
   - Run `node ak5e/tools/validate-files.mjs` to observe file and syntax validation.
   - Run `node ak5e/tools/verify-generated-content.mjs` to observe source coverage validation.
3. **Inspect Browser Launcher & Live Test Harness:**
   - Inspect `ak5e/tools/test-browser.mjs` and `/tmp/run-guard-live.sh`.
   - Inspect `ak5e/tools/test-guard-live.mjs` lines 1–150 and 565–600 for Playwright interaction and undo patterns.
4. **Invalidation Conditions:**
   - If `validate-files.mjs` or `verify-generated-content.mjs` fails when new files are introduced.
   - If Playwright launches without `launchTestBrowser()` or disables GPU acceleration.
   - If dice are auto-rolled or actions lack encounter-window undo.
