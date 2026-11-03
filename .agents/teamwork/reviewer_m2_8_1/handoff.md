# Review & Adversarial Challenge Report: Milestone 2 — Executor Subclass Implementation & Tests

**Reviewer Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_8_1/`  
**Target Milestone:** Milestone 2: Executor Subclass Implementation & Tests  
**Target Files:**  
- `ak5e/scripts/executor-features.mjs`
- `ak5e/scripts/specialist-uses.mjs`
- `ak5e/scripts/specialist-sheet.mjs`
- `ak5e/scripts/ak5e.mjs`
- `ak5e/test/executor.test.mjs`
- `ak5e/DECISIONS.md`
- `TODO.md`

---

## Review Summary

**Verdict: REQUEST_CHANGES**

### Findings Overview
1. **[Critical] Finding 1: Duplicate and Leaking Hook Registrations in `registerExecutorHooks()` Causing Critical Threshold Inflation and Doubled Bonus Damage**
2. **[Major] Finding 2: Hunter Sweeper Fails to Transfer Deathmark When Already on Another Creature**
3. **[Minor] Finding 3: Level 20 Bodyguard Damage Resistance Against Marked Creature is Unautomated at Runtime**

---

## 1. Observation

### 1.1 Direct Observations & Code Audit

1. **`ak5e/scripts/executor-features.mjs` lines 348–354 and lines 538–542:**
   ```javascript
   348:   if (globalThis.Hooks?.on) {
   349:     Hooks.on("dnd5e.preRollAttackV2", executorPreRollAttack);
   350:     Hooks.on("dnd5e.preRollDamageV2", executorPreRollDamage);
   351:   }
   352: 
   353:   if (ak5eEventsInstalled) return;
   354:   ak5eEventsInstalled = true;
   ...
   538:   if (globalThis.Hooks?.on) {
   539:     Hooks.on("dnd5e.preRollAttackV2", executorPreRollAttack);
   540:     Hooks.on("dnd5e.preRollDamageV2", executorPreRollDamage);
   541:   }
   542: }
   ```
   - On a single call to `registerExecutorHooks()`, `Hooks.on("dnd5e.preRollAttackV2")` and `Hooks.on("dnd5e.preRollDamageV2")` are registered twice (once at line 349, and once at line 539).
   - Lines 348–351 are located *before* the guard `if (ak5eEventsInstalled) return;`. On every subsequent call to `registerExecutorHooks()`, additional duplicate callbacks are attached to `Hooks`.
   - In `ak5e/scripts/executor-features.mjs` lines 296–302 (`executorPreRollAttack`):
     ```javascript
     296:   if (isTargetMarked) {
     297:     for (const roll of config.rolls ?? []) {
     298:       roll.options ??= {};
     299:       roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
     300:       roll.options.criticalThreshold = Math.min(Number(roll.options.criticalThreshold ?? 20) - 1, 19);
     301:     }
     302:   }
     ```
   - In `ak5e/scripts/executor-features.mjs` lines 327–330 (`executorPreRollDamage`):
     ```javascript
     327:   if (isTargetMarked) {
     328:     const bonus = calculateDeathmarkDamageBonus(specialistLevel(actor));
     329:     roll.parts.push(bonus);
     330:   }
     ```

2. **Reproduction Execution & Output:**
   Command:
   ```bash
   node -e '
   import { setupFoundryGlobals, createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
   import { registerExecutorHooks, setDeathmark } from "./ak5e/scripts/executor-features.mjs";
   import { SPECIALIST_CLASS_ID } from "./ak5e/scripts/specialist-rules.mjs";

   setupFoundryGlobals();
   registerExecutorHooks();

   const hunter = createTestActor({
     name: "Hunter",
     items: [
       createTestItem({ name: "Specialist", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } }),
       createTestItem({ name: "Executor", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor", executorPath: "hunter" } } })
     ],
     flags: { ak5e: { specialist: { enabled: true, branch: "executor" }, executor: { path: "hunter" } } }
   });

   const target = createTestActor({ name: "Target" });
   await setDeathmark(hunter, target);

   const attackConfig = {
     subject: { actor: hunter },
     target,
     rolls: [{ options: { criticalThreshold: 20 } }]
   };

   await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
   console.log("Critical threshold after preRollAttackV2 via Hooks:", attackConfig.rolls[0].options.criticalThreshold);

   const damageConfig = {
     subject: { actor: hunter },
     target,
     rolls: [{ parts: ["1d8"] }]
   };
   await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
   console.log("Damage parts after preRollDamageV2 via Hooks:", damageConfig.rolls[0].parts);
   '
   ```
   Verbatim Output:
   ```text
   Critical threshold after preRollAttackV2 via Hooks: 18
   Damage parts after preRollDamageV2 via Hooks: [ '1d8', '1d4', '1d4' ]
   ```

3. **`ak5e/scripts/executor-features.mjs` lines 366–371 and lines 391–397 (Sweeper Mark Transfer):**
   ```javascript
   366:     if (dm.holder === "self" && targetUuid) {
   367:       const timing = globalThis.game?.ak5e?.specialist?.ruling?.(actor, "deathmarkTransferTiming") ?? "onAttackRoll";
   368:       if (timing === "onAttackRoll") {
   369:         await setDeathmark(actor, { uuid: targetUuid, name: targetName });
   370:       }
   371:     }
   ...
   391:     if (dm.holder === "self" && targetUuid) {
   392:       const timing = globalThis.game?.ak5e?.specialist?.ruling?.(actor, "deathmarkTransferTiming") ?? "onAttackRoll";
   393:       if (timing === "onHitOnly") {
   394:         await setDeathmark(actor, { uuid: targetUuid, name: targetName });
   395:       }
   396:     }
   ```
   - Source Rule (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` line 5532):
     *"If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature. At the end of the Action, your Deathmark returns to you."*
   - Because `onAk5eEvent("hit")` gates transfer strictly on `dm.holder === "self"`, hitting creature B while creature A holds Deathmark during Sweeper fails to transfer the mark to creature B.

4. **Test Suite Baseline Verifications:**
   - `node --test ak5e/test/executor.test.mjs` -> 13 pass, 0 fail.
   - `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs` -> 61 pass, 0 fail.
   - `node ak5e/tools/validate-files.mjs` -> Validated module.json, lang/en.json, and 269 .mjs files.
   - `node ak5e/tools/verify-generated-content.mjs` -> Verified all generated Chapter 1–6 records (2193 top-level, 801 Chapter 6 features).

---

## 2. Logic Chain

1. **Why Finding 1 is a Critical Defect:**
   - In `ak5e/scripts/executor-features.mjs`, `registerExecutorHooks()` contains two separate blocks registering `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2`.
   - In Foundry VTT runtime, when D&D5e executes `Hooks.callAll("dnd5e.preRollAttackV2", config)` and `Hooks.callAll("dnd5e.preRollDamageV2", config)`, both registered callbacks fire sequentially.
   - On the attack roll, the first callback reduces `criticalThreshold` from 20 to 19. The second callback immediately reduces it again from 19 to 18. This grants an unintended +2 critical range boost (violating Ch. 3 line 5514: *"The Critical Range of your Attacks against Creatures with your Deathmark is increased by 1"*).
   - On the damage roll, both callbacks append the Deathmark bonus damage to `roll.parts`, resulting in `['1d8', '1d4', '1d4']` at level 1, `['1d8', '2d4', '2d4']` at level 7, and `['1d8', '3d4', '3d4']` at level 14. This violates Ch. 3 line 5512.
   - Furthermore, because lines 348–351 are outside `if (ak5eEventsInstalled) return;`, any subsequent invocation of `registerExecutorHooks()` adds more duplicate callbacks, exacerbating threshold inflation and bonus damage stacking.
   - In `ak5e/test/executor.test.mjs`, the worker tested these functions by invoking `executorPreRollAttack` and `executorPreRollDamage` directly as functions rather than triggering them through `Hooks.callAll`, which masked the duplicate registration.

2. **Why Finding 2 is a Major Defect:**
   - Sweeper is designed for multi-target cleave attacks (`make Melee Attack against each Creature of your Choice within your Reach`).
   - The source explicitly mandates: *"If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature."*
   - In `executor-features.mjs`, `onAk5eEvent("hit")` checks `dm.holder === "self"`. If the Specialist hits the first creature, the mark transfers to it (`dm.holder = "target"`). When hitting subsequent creatures in the same Sweeper action, `dm.holder === "self"` evaluates to false, so the mark fails to transfer to the newly hit creatures, breaking the Sweeper mark cycling mechanic.

3. **Table Play Philosophy (WORKFLOW §3.2) Verification:**
   - Confirmation on active abilities: Verified in `specialist-uses.mjs`.
   - Non-blocking warnings with "Use anyway": Verified across all 8 Executor plans.
   - 0-floor resource clamping: Verified with shortfall notices.
   - Interactive roll buttons (no auto-rolled dice): Verified on `mortalBlow` (`receipt.formula = "10d8"`).
   - Undo receipts and reversibility: Verified in Test Area 13.

---

## 3. Caveats

- Foundry V13 headless browser testing with live screenshots is assigned to Milestone 5 for the Specialist class and subclasses.
- All functional logic was verified through automated runtime execution, Node tests, and code inspection.

---

## 4. Conclusion

While the core architecture, table-play patterns, undo receipts, and source mappings in Milestone 2 are well-structured, **Finding 1 is a game-breaking runtime bug** that directly corrupts attack and damage rolls in Foundry VTT, and **Finding 2 breaks Sweeper's primary mark-cycling mechanic**.

Therefore, the verdict is **REQUEST_CHANGES**.

### Required Action Items for Worker:
1. **Fix Hook Registration & Leakage in `ak5e/scripts/executor-features.mjs`:**
   - Delete the duplicate registration block at lines 538–542.
   - Place lines 348–351 inside an idempotency guard (or gate hook registration with an `installedHooks` boolean flag) so `Hooks.on` is called exactly once.
   - Make `executorPreRollAttack` and `executorPreRollDamage` idempotent per roll object (e.g. guard against duplicate part pushes if `roll.parts.includes(bonus)` and ensure `criticalThreshold` is not decremented more than once per roll).
2. **Fix Sweeper Mark Transfer in `ak5e/scripts/executor-features.mjs`:**
   - In `onAk5eEvent("hit")` (and `onAk5eEvent("attack")` under the `onAttackRoll` ruling), allow Deathmark transfer if `dm.holder === "self"` OR if `actor.flags?.ak5e?.executor?.sweeper?.active` is true.
3. **Enhance Test Coverage in `ak5e/test/executor.test.mjs`:**
   - Add a test that calls `Hooks.callAll("dnd5e.preRollAttackV2", ...)` and `Hooks.callAll("dnd5e.preRollDamageV2", ...)` to verify that hooks do not double-apply when triggered through the Foundry event pipeline.
   - Add a test verifying that during an active Sweeper action, hitting a second creature transfers Deathmark even if it is already held by a first creature.

---

## 5. Verification Method

To independently verify the defects and validate the fixes:

1. **Verify the Hook Registration Bug (Current State reproduces the defect):**
   ```bash
   node -e '
   import { setupFoundryGlobals, createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
   import { registerExecutorHooks, setDeathmark } from "./ak5e/scripts/executor-features.mjs";
   import { SPECIALIST_CLASS_ID } from "./ak5e/scripts/specialist-rules.mjs";

   setupFoundryGlobals();
   registerExecutorHooks();

   const hunter = createTestActor({
     name: "Hunter",
     items: [
       createTestItem({ name: "Specialist", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } }),
       createTestItem({ name: "Executor", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor", executorPath: "hunter" } } })
     ],
     flags: { ak5e: { specialist: { enabled: true, branch: "executor" }, executor: { path: "hunter" } } }
   });

   const target = createTestActor({ name: "Target" });
   await setDeathmark(hunter, target);

   const attackConfig = { subject: { actor: hunter }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
   await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
   console.log("Crit Threshold (expected 19):", attackConfig.rolls[0].options.criticalThreshold);

   const damageConfig = { subject: { actor: hunter }, target, rolls: [{ parts: ["1d8"] }] };
   await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
   console.log("Damage parts (expected [\"1d8\", \"1d4\"]):", damageConfig.rolls[0].parts);
   '
   ```
   *Expected fix outcome:* `Crit Threshold` must be `19`, and `Damage parts` must be `[ '1d8', '1d4' ]`.

2. **Run Full Test Suites:**
   ```bash
   node --test ak5e/test/executor.test.mjs
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
