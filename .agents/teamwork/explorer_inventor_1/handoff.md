# Comprehensive Architecture Investigation & Pattern Mapping for Inventor Specialist Subclass

**Agent**: `explorer_inventor_1`  
**Date**: 2026-10-20  
**Target Milestone**: Inventor Specialist Subclass Implementation  
**Status**: Complete  

---

## 1. Observation

### 1.1 Specialist Subclass Registration & Profile Detection
- In `ak5e/scripts/specialist-rules.mjs` (L9–27):
  ```javascript
  9: export const SPECIALIST_BRANCH_IDS = Object.freeze({
  10:   "subclass-specialist-executor": "executor",
  11:   "subclass-specialist-hookmaster": "hookmaster",
  12:   "subclass-specialist-infuser": "infusion",
  13:   "subclass-specialist-inventor": "inventor",
  14:   "subclass-specialist-skyranger": "skyranger",
  15:   "subclass-specialist-dollkeeper": "dollkeeper",
  16:   "subclass-specialist-trapmaster": "trapmaster"
  17: });
  18: 
  19: export const IMPLEMENTED_SPECIALIST_BRANCHES = Object.freeze([
  20:   "executor",
  21:   "hookmaster",
  22:   "infusion",
  23:   "inventor",
  ...
  27: ]);
  ```
  The branch mapping `"subclass-specialist-inventor": "inventor"` already exists in `SPECIALIST_BRANCH_IDS` and `"inventor"` is already listed in `IMPLEMENTED_SPECIALIST_BRANCHES`.
- In `specialist-rules.mjs` (L293–331):
  Subclass predicate functions are explicitly exported for existing subclasses:
  - `isExecutor(actor)` (L293–303): checks `isSpecialist(actor)` and branch identifier `"executor"` or subclass item `"subclass-specialist-executor"`.
  - `isHookmaster(actor)` (L305–315): checks `isSpecialist(actor)` and branch identifier `"hookmaster"` or subclass item `"subclass-specialist-hookmaster"`.
  - `isInfuser(actor)` (L317–331): checks `isSpecialist(actor)` and branch identifier `"infuser"` / `"infusion"` or subclass item `"subclass-specialist-infuser"` / `"subclass-specialist-infusion"`.
  - `isInventor(actor)` is **not yet defined** in `specialist-rules.mjs`.

### 1.2 Specialist Progression & Idempotent Setup
- In `ak5e/scripts/specialist-progression.mjs` (L233–392, L411–626):
  - Progression inspects actor items and options using pure functions (`inspectSpecialistFields`, `previewSpecialistProgression`).
  - At level 1, if no subclass item is attached, it renders a branch selection choice from `SPECIALIST_BRANCH_IDS` (L239–244).
  - Talents are granted at levels 3, 8, 9, 13 via `grantTalent` (L597–612) referencing `CHAPTER_THREE_CLASSES` entries with `kind === "class-option"` and `parentClass === "Specialist"`.
  - `specialistProgression` stores choices and granted levels in `flags.ak5e.specialistProgression` (`hpLevels`, `asiLevels`, `startingEquipmentGranted`).
- In `ak5e/scripts/specialist-setup.mjs` (L7–87):
  - Idempotently grants core class features (`SPECIALIST_CORE_FEATURES`, L7–21) matching the current level without duplicating existing items.

### 1.3 Resource Pool Architecture
- In `ak5e/scripts/resource-pools.mjs`:
  - `definePool(definition, { replace })` (L176–194) normalizes formulas, level tables, and recovery rules.
  - Formula variables supported (L25, L203–214): `@prof`, `@level`, `@classLevel`, `@abilities.<ability>.mod`.
  - `registerProwessPool()` (L491–510) defines the core Specialist pool:
    ```javascript
    definePool({
      id: "prowess",
      label: "Prowess",
      classId: "class-specialist",
      levelBasis: "classLevel",
      max: "@prof",
      initial: 0,
      appliesTo: actor => { ... },
      recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]
    });
    ```
  - Subclass feature modules define their pools via dedicated functions:
    - In `executor-features.mjs` (L278–290): `defineExecutorPools()` registers `mortalBlow` (`max: 1`, `initial: "max"`, `recovery: [{ on: "lr", amount: "toMax" }]`).
    - In `hookmaster-features.mjs` (L385–411): `defineHookmasterPools()` registers `mightyPush` (`max: "@prof"`) and `scorpionSting` (`max: 1`).
    - In `infuser-features.mjs` (L228–253): `defineInfuserPools()` registers `alchemicalInfusions` (`max: "2 * @prof"`, `initial: "max"`, `recovery: [{ on: "lr", amount: "toMax" }]`, `appliesTo: actor => isInfuser(actor)`) and `toDefyScience` (`max: 1`).
- Source rules in `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (L5858):
  > "You have a number of Inventions equal to twice your Proficiency Bonus that you expend to modify equipment. Each Modification you apply consumes 1 Invention; this Invention is refunded when that Modification is removed."

### 1.4 Feature Implementations, Play-Uses Kernel, & Plan Architecture
- Existing subclass modules:
  - `ak5e/scripts/executor-features.mjs`: Pure state getters/setters (`getDeathmarkState`, `setDeathmark`, `recallDeathmark`), predicate checks (`hasInEveryShadow`, `hasSweeper`, etc.), and hook handlers (`executorPreRollAttack`, `executorPreRollDamage`, `onAk5eEvent`).
  - `ak5e/scripts/hookmaster-features.mjs`: Weapon inspection (`canConvertWeaponToHook`, `isHookedWeapon`), conversion/reversion (`convertHookedWeapon`, `revertHookedWeapon`), hook handlers, and state management.
  - `ak5e/scripts/infuser-features.mjs`: Dictionary of 8 infusions (`INFUSIONS`), Infuser DC (`calculateInfuserDC`), range (`calculateInfusionRange`), hook handlers (`infuserPreRollDamage`, `infuserPreApplyDamage`), and state management.
- In `ak5e/scripts/specialist-uses.mjs`:
  - Instantiates `specialistUses = createPlayUses({ ns: "specialistUses", label: "Specialist", isMember: actor => specialistEnabled(actor), ... })` (L46–52).
  - All plans are registered in `ALL_PLANS` dictionary (L2129) via `specialistUses.register({ plans: ALL_PLANS, readings: ALL_READINGS, cleanup: specialistCleanup })`.
  - Non-blocking warnings: plans populate `warnings = []` using `warn(warnings, "id", "Text")` and level check `levelWarning(warnings, actor, level, name)`.
  - In `play-uses-sheet.mjs` (L19–38): `confirmPlayUse` catches `isPlayWarnings(error)` and displays a Dialog with "Use anyway" button, passing `overrides: [...]` back to the plan.
  - Zero-clamping: `spendResource(actor, receipt, { pool, amount, label })` (in `play-uses.mjs` L57–63) clamps value at 0, records `{ path, before, after, max, label }` on `receipt.resources`, and appends shortfall to `receipt.shortfalls`.
  - Unowned target mutation & GM relay:
    - Target kind handlers in `play-uses.mjs` (L98–183): `heal`, `tempHP`, `effect`.
    - Static `.validateTarget` property on plan functions (e.g. `specialist-uses.mjs` L655, L1459, L1911):
      ```javascript
      PLAN_NAME.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
      ```
    - When `!canWrite(target)`, `changeTarget` submits an operation to `relay.submit(...)` which is processed by the GM client via `handleRelay` (L210–230). The GM client validates `validateTarget` before modifying unowned targets.
  - Interactive roll buttons on cards (WORKFLOW §3.2):
    - When a plan sets `receipt.formula` and `receipt.rollLabel` (or `receipt.dc`, `receipt.saveAbility`), `play-uses.mjs` marks `receipt.status = "awaitingRoll"`.
    - `renderPlayUseCard` in `play-uses-sheet.mjs` (L80) appends an interactive button: `Roll ${receipt.formula} ${receipt.rollLabel}`.
    - When clicked, `useRoll` rolls dice and applies the result without auto-rolling.
  - Undo Receipts:
    - Stored under `flags.ak5e.specialistUses.undo` as an array of receipts.
    - Stored fields: `id`, `command`, `title`, `summary`, `resources`, `flagChanges`, `result`, `targetUuid`, `targetName`, `overridden`, `status`.
    - `specialistCleanup` in `specialist-uses.mjs` (L2107–2110) dispatches cleanup logic to subclass cleanup functions (`hookmasterCleanup`, `infuserCleanup`) to reverse complex mutations (flags on targets, item property restorations).

### 1.5 Sheet UI Integration
- In `ak5e/scripts/specialist-sheet.mjs`:
  - `renderSpecialistControls(app, element)` (L485–531) renders into `ActorSheetV2`'s `.tab[data-tab="features"]`.
  - Prepends `.ak5e-specialist-sheet-panel` containing:
    - `h3` "Specialist"
    - `div.ak5e-specialist-summary.ak5e-specialist-badges` container for badges:
      - Core badge: `getProwessBadgeText(actor, profile)`
      - Subclass badges: `getDeathmarkStateText(actor)` for Executor, `getHookedWeaponStatusText(actor)` for Hookmaster, `Infuser DC` and `getActiveInfusionsCountText(actor)` for Infuser.
    - Control button: "Open Specialist Controls" (or "Set up Specialist" if unconfigured).
  - `openSpecialistControls(actor)` (L90–296) renders a `DialogV2` modal displaying DC summary, pool status, buttons for each command (`data-specialist-cmd`), progression button (`data-specialist-act="__progression"`), and undo button (`data-specialist-act="__undoList"`).

### 1.6 Module Entry Point
- In `ak5e/scripts/ak5e.mjs`:
  - Imports rule and feature exports (L89–157).
  - In `Hooks.once("ready", ...)`:
    - Registers API under `game.ak5e.specialist` (L344–431), including sub-objects `executor`, `hookmaster`, `infuser`.
    - Invokes lifecycle hooks (L562–567):
      ```javascript
      registerSpecialistHooks();
      registerExecutorHooks();
      registerHookmasterHooks();
      registerInfuserHooks();
      Hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(specialistUses.handleRelay(message, options, userId)).catch(error => console.error("AK5e | Specialist relay", error)));
      registerSpecialistSheetHooks();
      ```

### 1.7 Test Suites & Live Browser Test Structure
- `package.json` (L29):
  ```json
  "test:specialist": "node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/hookmaster-adversarial.test.mjs ak5e/test/infuser.test.mjs ak5e/test/infuser-adversarial.test.mjs"
  ```
- Subclass unit tests (`ak5e/test/infuser.test.mjs`, `executor.test.mjs`, `hookmaster.test.mjs`):
  - Use `node:test` and `node:assert/strict`.
  - Use `base-classes-fixture.mjs` (`setupFoundryGlobals()`, `teardownFoundryGlobals()`, `createTestActor()`, `createTestItem()`).
  - Structured into numbered functional areas (15+ areas per subclass), covering predicates, formulas, pool caps, warnings, plans, and undo reversibility.
  - Subclass adversarial tests (`infuser-adversarial.test.mjs`, etc.) cover negative cases: invalid inputs, tampering, missing tools, out-of-range targets, unauthorized callers, duplicate execution, and state corruption recovery.
- Live browser test script (`ak5e/tools/test-specialist-live.mjs`):
  - Uses `launchTestBrowser()` from `ak5e/tools/test-browser.mjs` per WORKFLOW §5.3.
  - Connects to Foundry V13 on port `AK5E_TEST_PORT` (30175).
  - Sets up disposable actors for base Specialist and subclasses in `standard-test` world.
  - Exercises rendered sheet, badges, controls dialog, action cards, interactive roll buttons, and undo execution.
  - Captures 17 sequential screenshots into `AK5E_TEST_OUTPUT` (`/tmp/ak5e-specialist-evidence/`).
  - Asserts `report.errors.length === 0` (zero browser errors).

---

## 2. Logic Chain

### 2.1 Subclass Definition & Predicate Logic
1. **Fact**: In `specialist-rules.mjs` (L13), `"subclass-specialist-inventor": "inventor"` is defined in `SPECIALIST_BRANCH_IDS`.
2. **Fact**: `specialistProfile(actor)` identifies subclass by checking `flag(branchItem, "chapterThreeId")`, item identifier, and normalized item name. For Inventor items, `branch` evaluates to `"inventor"`.
3. **Inference**: Defining `isInventor(actor)` following the exact pattern of `isExecutor` (L293–303) and `isHookmaster` (L305–315):
   ```javascript
   export function isInventor(actor) {
     if (!isSpecialist(actor)) return false;
     if (specialistBranch(actor) === "inventor") return true;
     const items = list(actor.items);
     return items.some(i => i.type === "subclass" && (
       flag(i, "chapterThreeId") === "subclass-specialist-inventor" ||
       i.identifier === "inventor" ||
       i.system?.identifier === "inventor" ||
       i.name?.toLowerCase().includes("inventor")
     ));
   }
   ```
4. **Conclusion**: `isInventor(actor)` must be exported from `ak5e/scripts/specialist-rules.mjs` and re-exported under `game.ak5e.specialist.isInventor`.

### 2.2 Resource Pool Architecture for Inventions
1. **Fact**: Source text (Ch. 3 L5858) states: "You have a number of Inventions equal to twice your Proficiency Bonus that you expend to modify equipment. Each Modification you apply consumes 1 Invention; this Invention is refunded when that Modification is removed."
2. **Fact**: `resource-pools.mjs` supports formula strings with `@prof` (e.g. `residualSuffering` uses `"2 * @prof"` in `caster-primal-splash.mjs:616`; `alchemicalInfusions` uses `"2 * @prof"` in `infuser-features.mjs:233`).
3. **Inference**: The `inventions` pool should be defined in `inventor-features.mjs` (and optionally registered in `resource-pools.mjs` or `specialist-features.mjs`) as:
   ```javascript
   export function defineInventorPools() {
     if (!getPoolDefinition("inventions")) {
       definePool({
         id: "inventions",
         label: "Inventions",
         max: "2 * @prof",
         initial: "max",
         classId: SPECIALIST_CLASS_ID,
         levelBasis: "classLevel",
         appliesTo: actor => isInventor(actor),
         recovery: [{ on: "lr", amount: "toMax" }]
       });
     }
     if (!getPoolDefinition("theBigOne")) {
       definePool({
         id: "theBigOne",
         label: "The Big One",
         max: 1,
         initial: "max",
         classId: SPECIALIST_CLASS_ID,
         levelBasis: "classLevel",
         appliesTo: actor => isInventor(actor) && (specialistLevel(actor) >= 20),
         recovery: [{ on: "lr", amount: "toMax" }]
       });
     }
   }
   ```
4. **Behavior on Modification**:
   - Applying a modification spends 1 Invention via `spendResource(actor, receipt, { pool: "inventions", amount: 1, label: "Inventions" })`.
   - Removing a modification refunds 1 Invention via `refundPool(actor, "inventions", 1, { reason: "Modification removed" })`.
   - Mobile Modding (Lv 5): explicitly does NOT cost an Invention (costs 1 Prowess instead and expires after 1 minute).

### 2.3 Equipment Modification Attachment & Data Model
1. **Fact**: Source text (Ch. 3 L5860) specifies:
   - Targets: Non-magical Weapon or piece of Armour.
   - Constraint 1: A piece of equipment cannot have duplicate Modifications.
   - Constraint 2: Modification takes 10 minutes to apply/remove.
   - Constraint 3: Auto-removed after 1 week if lost/stolen.
2. **Inference on Item Document Storage**:
   The active modifications on a Weapon or Armour document should be stored in `flags.ak5e.inventor.modifications`:
   ```javascript
   item.flags.ak5e.inventor.modifications = [
     {
       id: "boomModule",
       name: "Boom Module",
       category: "melee",
       dangerous: false,
       inventorUuid: actor.uuid,
       appliedAt: game.time?.worldTime ?? Date.now(),
       mobileModding: false
     }
   ];
   ```
   To maintain fast indexed reads and compatibility:
   - On the Item: `flags.ak5e.modifications` or `flags.ak5e.inventor.modifications` array/record.
   - On the Actor: `flags.ak5e.inventor.modifiedItems` mapping `{ [itemUuid]: [modIds] }` to track all active modifications across equipment for easy recovery and inspection.

### 2.4 Instability Calculation & Dynamic Breakdown Workflow
1. **Fact**: Source text (Ch. 3 L5864, L5913–5915, L5954) specifies:
   - Base Instability = 3 for 1st modification.
   - +1 Instability for each Modification after the first.
   - +1 additional Instability for each Modification marked as Dangerous.
   - 11th Level Risk Assessment (Speciality Modding): -1 Instability if weapon matches Weapon Specialisation choice.
   - 11th Level Risk Assessment (Trained Operator): -1 Instability if equipment is wielded or worn by the Inventor themselves.
2. **Instability Formula Implementation**:
   ```javascript
   export function calculateInstability(item, actor, { isInventorWielding = true } = {}) {
     const mods = getItemModifications(item);
     if (!mods || mods.length === 0) return 0;
     
     // Base 3 for 1st mod + 1 for each additional mod
     let instability = 3 + (mods.length - 1);
     
     // Dangerous mods increase instability by 1 more than usual (+1 extra per dangerous mod)
     const dangerousCount = mods.filter(m => m.dangerous).length;
     instability += dangerousCount;
     
     // Level 11 Risk Assessment
     const lvl = specialistLevel(actor) ?? 1;
     if (lvl >= 11) {
       // Speciality Modding: matches Weapon Specialisation
       const spec = getWeaponSpecialisation(actor);
       const isMelee = item.system?.actionType === "mwak" || item.system?.type?.value?.includes?.("melee");
       const isRanged = item.system?.actionType === "rwak" || item.system?.type?.value?.includes?.("ranged");
       if ((spec.category === "melee" && isMelee) || (spec.category === "ranged" && isRanged)) {
         instability -= 1;
       }
       // Trained Operator: wielded or worn by the Inventor
       if (isInventorWielding) {
         instability -= 1;
       }
     }
     
     return Math.max(1, instability);
   }
   ```
3. **Instability Breakdown Activation & Interactive Chat Card**:
   - Source rule: When a creature activates a modification, they roll a number of d6s equal to that equipment's Instability. If any dice match another die (duplicate result), equipment suffers a breakdown:
     - Wielder/wearer loses `1d8 + (Instability - 3)d8` Hit Points (i.e. `(Instability - 2)d8` HP loss).
     - HP loss cannot reduce below 1 HP (`Math.max(1, currentHP - loss)`).
     - Dangerous breakdown: equipment damaged (weapon unusable, armor provides no benefit) until repaired with Maintenance Kit.
   - WORKFLOW §3.2 requirement: **NEVER auto-roll feature dice**.
   - Architecture Pattern:
     - When `activateModification` plan is called, it registers the action and evaluates Instability.
     - Sets `receipt.status = "awaitingRoll"`, `receipt.formula = "${instability}d6"`, and `receipt.rollLabel = "Instability Check"`.
     - The chat card renders an interactive button: `Roll ${instability}d6 Instability Check`.
     - When clicked, `useRoll` rolls the d6s, inspects for duplicate values (`new Set(rolls).size < rolls.length`), and if duplicates occur, posts the Breakdown notice with an interactive button to roll breakdown HP loss: `Roll ${instability - 2}d8 Breakdown HP Loss`.

### 2.5 Target Mutation, GM Relay, and Undo Receipts
1. **Fact**: In `specialist-uses.mjs`, all target mutations on external actors use `validateTarget` and the operation-kernel GM relay.
2. **Invention Plan Target Validation**:
   - `applyModification.validateTarget`: `(source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
   - `removeModification.validateTarget`: same.
   - `mobileModding.validateTarget`: same.
   - `strangeContraption.validateTarget`: same (for targeted effects like 12 Million Lumen Flashlight or Needlefly Fumigator).
   - `theBigOne.validateTarget`: same.
3. **Undo Receipts**:
   - `specialistCleanup` in `specialist-uses.mjs` (L2107–2110) must call `inventorCleanup(state, receipt, actor)`.
   - `inventorCleanup` reverts applied modifications, restores deducted Inventions/Prowess, clears active contraption flags, and removes damaged condition flags if undone.

### 2.6 Sheet UI Injection Pattern
1. **Fact**: In `specialist-sheet.mjs` (L500–518), badges are prepended into `.ak5e-specialist-summary.ak5e-specialist-badges`.
2. **Inference**: For an Inventor actor:
   - Add `isInventor(actor)` branch in `renderSpecialistControls`:
     ```javascript
     } else if (isInventor(actor)) {
       const invPool = getPool(actor, "inventions");
       const invVal = invPool?.value ?? 0;
       const invMax = invPool?.max ?? (2 * pbForLevel(profile.level ?? 1));
       badgesContainer.append(node("span", `Inventions: ${invVal} / ${invMax}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-inventor ak5e-specialist-badge-inventions"));
       badgesContainer.append(node("span", `Inventor DC: ${8 + Number(actor.system?.abilities?.int?.mod ?? 0) + pbForLevel(profile.level ?? 1)}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-inventor ak5e-specialist-badge-inventor-dc"));
     }
     ```
   - In `openSpecialistControls(actor)`: Add an action group for `Inventor Actions` containing buttons for `applyModification`, `removeModification`, `mobileModding`, `strangeContraption`, and `theBigOne`.

---

## 3. Caveats

1. **Compendium Equipment vs In-Memory Items**: Non-magical equipment can come from compendiums (`dnd5e.items` or `ak5e.items`) or created directly on actors. Modification logic must handle both Document updates (`item.update({...})`) and plain in-memory flag objects in mocked test environments.
2. **Dangerous Modification Damage Status**: When a Dangerous modification breaks down, the item is damaged (unusable/no benefit). The game system does not have a native "broken item" state on standard Item5e; setting `flags.ak5e.inventor.isDamaged = true` and disabling equip/active status is the faithful representation.
3. **Double-Blind vs Strange Contraption Table**: Strange Contraptions are selected from a fixed table (8 options), but unlike Double-Blind Trial (which rolls 1d6 randomly), the player *chooses* the option and cannot choose that option again until a Long Rest. Tracking used contraptions requires `flags.ak5e.inventor.usedContraptions: string[]` reset on Long Rest.
4. **Maintenance Kit Repair**: The source specifies repair via Maintenance Kit or similar. An interactive button or plan `repairDamagedEquipment` should be provided to allow table play resolution without GM manual database hacking.

---

## 4. Conclusion

The architectural blueprints for the Inventor subclass are fully mapped and align perfectly with existing Specialist patterns:

1. **Subclass Definition (`ak5e/scripts/specialist-rules.mjs`)**:
   - Export `isInventor(actor)` verifying `chapterThreeId === "subclass-specialist-inventor"`, identifier `"inventor"`, or branch `"inventor"`.
   - Calculate `inventorDC(actor) = 8 + intMod + pb`.
2. **Resource Pools (`ak5e/scripts/inventor-features.mjs`)**:
   - `inventions`: `max: "2 * @prof"`, `initial: "max"`, `recovery: [{ on: "lr", amount: "toMax" }]`, `appliesTo: isInventor`.
   - `theBigOne`: `max: 1`, `initial: "max"`, `recovery: [{ on: "lr", amount: "toMax" }]`, `appliesTo: actor => isInventor(actor) && specialistLevel(actor) >= 20`.
3. **Feature Logic & Instability Kernel (`ak5e/scripts/inventor-features.mjs`)**:
   - Full dictionary of all 28 modifications (10 Melee, 8 Ranged, 10 Armour).
   - Full dictionary of 8 Strange Contraptions and 15th-level Stranger Contraptions upgrades.
   - Instability calculation with Risk Assessment reductions (-1 Speciality Modding, -1 Trained Operator).
   - Event listeners for `kill` event: when a creature who activated a modification this turn drops an enemy to 0 HP, refund 1 Prowess to Inventor (1/turn).
4. **Play-Uses Engine Plans (`ak5e/scripts/specialist-uses.mjs`)**:
   - `applyModification`: validates equipment type (melee, ranged, armour), non-magical, no duplicate mod, spends 1 Invention, records original item state and undo receipt.
   - `removeModification`: removes mod, refunds 1 Invention, updates item properties.
   - `activateModification`: evaluates Instability, issues `awaitingRoll` status on card with interactive roll button (`Roll Nd6 Instability Check`). If breakdown, issues interactive HP loss roll (`(N-2)d8`) clamped at 1 HP, and marks Dangerous items damaged.
   - `mobileModding`: 1 Prowess, applies temporary 1-minute modification at 0 Invention cost.
   - `strangeContraption`: validates once-per-long-rest choice, sets interactive DC and saving throw card.
   - `theBigOne`: 1/LR Action, choose Flash, Shard, or Quasar.
   - `inventorCleanup`: handles complete undo restoration for all Inventor plans.
5. **Sheet UI Integration (`ak5e/scripts/specialist-sheet.mjs`)**:
   - Injects `Inventions: X / Y` and `Inventor DC: Z` badges on ActorSheetV2 features tab.
   - Adds Inventor action buttons to `openSpecialistControls` dialog.
6. **Module API Registration (`ak5e/scripts/ak5e.mjs`)**:
   - Exposes `game.ak5e.specialist.inventor` sub-namespace.
   - Registers `registerInventorHooks()` in ready lifecycle.
7. **Test Strategy**:
   - `ak5e/test/inventor.test.mjs` (unit suite covering all 15 functional areas).
   - `ak5e/test/inventor-adversarial.test.mjs` (adversarial suite covering invalid targets, duplicates, shortfalls, lockouts).
   - Update `package.json` script `test:specialist` to include both test files.
   - Update `ak5e/tools/test-specialist-live.mjs` to add an Inventor test actor, open sheet, verify badges, execute modification application, trigger instability breakdown roll, and assert 0 browser errors.

---

## 5. Verification Method

### 5.1 Static Code & Unit Verification
1. Inspect the codebase targets with `grep_search` and `view_file` to confirm all referenced exports and hooks exist.
2. Run existing specialist test suite to verify baseline stability:
   ```bash
   npm run test:specialist
   ```
3. Run code file validator:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```

### 5.2 Verification Commands for Future Implementer
When the implementer builds `inventor-features.mjs`, `inventor.test.mjs`, and `inventor-adversarial.test.mjs`:
```bash
# Focused unit test command
node --test ak5e/test/inventor.test.mjs ak5e/test/inventor-adversarial.test.mjs

# Full specialist test suite
npm run test:specialist

# Verification of all module files
node ak5e/tools/validate-files.mjs
```

### 5.3 Live Browser Test Verification
Run the live headless Foundry V13 test browser session per GEMINI §5:
```bash
export AK5E_FOUNDRY_PATH=/home/patch/FoundryV13
export AK5E_TEST_DATA=/tmp/ak5e-test-world
export AK5E_TEST_PORT=30175
export AK5E_TEST_OUTPUT=/tmp/ak5e-specialist-evidence
export AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs

node ak5e/tools/test-specialist-live.mjs
```
Inspect the resulting `/tmp/ak5e-specialist-evidence/browser-report.json` and ensure `errors` is empty and all screenshots pass visual inspection.

### 5.4 Invalidation Conditions
This architecture design would be invalidated if:
1. The rules source (`AK5e_1.3.1_Foundry_Source`) is revised to change Inventions pool scaling from twice Proficiency Bonus (`2 * @prof`) to another formula.
2. Instability base value is changed from 3 or breakdown criteria is changed from duplicate dice faces.
3. Foundry V13 ApplicationV2 deprecates DialogV2 or changes ActorSheetV2 tab DOM layout.
