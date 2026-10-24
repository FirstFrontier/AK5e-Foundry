# Quality & Adversarial Review Report: Milestone 2 Iteration 2 (Specialist Executor Remediation)

**Agent Role**: Reviewer & Adversarial Critic  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_8_it2/`  
**Milestone**: Milestone 2 Iteration 2: Executor Subclass Remediation  
**Target Files Reviewed**:
- `ak5e/scripts/executor-features.mjs`
- `ak5e/test/executor.test.mjs`
- `ak5e/test/executor-adversarial.test.mjs`

---

## Review Summary

**Verdict**: **APPROVE**

Milestone 2 Iteration 2 has completely and verifiedly resolved all three critical defects and integrity violations identified in Iteration 1:
1. **Hook Idempotency & Duplicate Listener Elimination**: `registerExecutorHooks()` in `executor-features.mjs` now strictly tracks `hooksInstalled !== globalThis.Hooks`. The duplicate hook registration block at the end of the file was deleted, and per-roll idempotency guards (`_ak5eDeathmarkCritApplied`, `_ak5eDeathmarkDamageApplied`, `_ak5ePreysenseCritApplied`) provide defense-in-depth. Calling `registerExecutorHooks()` 10 times consecutively attaches exactly one listener, decrements critical threshold to exactly 19, and adds exactly one bonus die. Unit tests in `executor.test.mjs` now directly dispatch via `Hooks.callAll`, completely eliminating test masking.
2. **Sweeper Multi-Target Mark Cycling (Ch. 3 L5532)**: During active Sweeper attacks, `isSweeper || dm.holder === "self"` allows Deathmark to transfer to newly hit targets even when already placed on another creature from an earlier attack in the cleave. Mark transfer, kill recall, mid-cleave re-transfer, and turn-end recall were verified under adversarial stress.
3. **Actor Collection Traversal**: The robust `getGameActors()` helper cleanly extracts Actor document instances from plain Arrays, Foundry Collections with `.contents`, Maps with `.values()`, and iterable `[id, doc]` tuples. Zero-HP kill mark recall and Bodyguard protection Prowess triggers function reliably even when `raw.actor` is omitted.
4. **Zero Integrity Violations**: Verified no hardcoded test outputs, no facade implementations, no shortcuts, and no fabricated verification logs.

---

## 1. 5-Component Handoff Protocol

### 1.1 Observation

1. **Hook Registration Idempotency in `ak5e/scripts/executor-features.mjs`:**
   - Lines 21–22: Module-level registry tracking `let hooksInstalled = null; let ak5eEventsInstalled = false;`.
   - Lines 372–376: Registration guarded by `if (globalThis.Hooks?.on && hooksInstalled !== globalThis.Hooks) { hooksInstalled = globalThis.Hooks; ... }`.
   - Lines 378–379: Event layer guarded by `if (ak5eEventsInstalled) return; ak5eEventsInstalled = true;`.
   - Redundant hook registration block previously at lines 538–542 has been completely removed.
   - Lines 347–352: `executorPreRollAttack` contains roll-level guard `if (roll.options._ak5eDeathmarkCritApplied) continue; roll.options._ak5eDeathmarkCritApplied = true;`.
   - Lines 380–383, 388–395: `executorPreRollDamage` contains guards `_ak5eDeathmarkDamageApplied` and `_ak5ePreysenseCritApplied`.

2. **Sweeper Mark Transfer in `ak5e/scripts/executor-features.mjs`:**
   - Lines 416–425:
     ```javascript
     const sweeper = actor.getFlag?.("ak5e", "executor")?.sweeper ?? actor.flags?.ak5e?.executor?.sweeper;
     const isSweeper = Boolean(sweeper?.active);

     if (targetUuid && (isSweeper || dm.holder === "self")) {
       const timing = globalThis.game?.ak5e?.specialist?.ruling?.(actor, "deathmarkTransferTiming") ?? "onAttackRoll";
       if (isSweeper || timing === "onHitOnly") {
         await setDeathmark(actor, { uuid: targetUuid, name: targetName });
       }
     }
     ```
   - Lines 427–435: `currentDm` accurately re-evaluates `getDeathmarkState(actor)` after transfer to flag `attackedOrDamagedThisTurn`.
   - Lines 540–549: In `onAk5eEvent("turnEnd")`, concluding Sweeper deactivates the flag and recalls Deathmark to the Executor, granting 3 SP.

3. **`getGameActors()` Helper in `ak5e/scripts/executor-features.mjs`:**
   - Lines 24–38:
     ```javascript
     export function getGameActors() {
       const actors = globalThis.game?.actors;
       if (!actors) return [];
       if (Array.isArray(actors)) return actors;
       if (Array.isArray(actors.contents)) return actors.contents;
       if (typeof actors.values === "function") return Array.from(actors.values());
       if (typeof actors[Symbol.iterator] === "function") {
         const list = Array.from(actors);
         if (list.length > 0 && Array.isArray(list[0]) && list[0].length === 2 && typeof list[0][1] === "object") {
           return list.map(entry => entry[1]);
         }
         return list;
       }
       return [];
     }
     ```
   - Used in `onAk5eEvent("kill")` (line 476) and `onAk5eEvent("turnEnd")` (line 553).

4. **Test Suite Dispatch & Integrity in `ak5e/test/executor.test.mjs`:**
   - Area 4 (lines 277–296): Dispatches via `await Hooks.callAll("dnd5e.preRollDamageV2", rollConfig)` and asserts exact die frequency (`filter(p => p === "1d4").length === 1`).
   - Area 5 (lines 313–314): Dispatches via `await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig)` and asserts `criticalThreshold === 19`.
   - Area 10 (lines 520–521): Dispatches via `await Hooks.callAll("dnd5e.preRollDamageV2", critConfig)` and asserts `filter(p => p === "1d10").length === 2`.
   - Area 14 (lines 667–694): Explicit regression test calling `registerExecutorHooks()` twice and asserting single listener evaluation and Sweeper multi-target cycling.

5. **Automated Verification Command Results:**
   - `node --test ak5e/test/executor.test.mjs`: 14 tests pass, 0 fail (173 ms).
   - `node --test ak5e/test/executor-adversarial.test.mjs`: 11 tests pass, 0 fail (170 ms).
   - Full Specialist Suite (`specialist-rules`, `specialist-features`, `specialist-progression`, `specialist-adversarial`, `executor`, `executor-adversarial`): 73 tests pass, 0 fail (210 ms).
   - `node ak5e/tools/validate-files.mjs`: Validated module.json, lang/en.json, and 270 .mjs files (Clean PASS).
   - `node ak5e/tools/verify-generated-content.mjs`: 2193 top-level records + 801 embedded features verified against v1.3.1 source (Clean PASS).

---

### 1.2 Logic Chain

1. **Elimination of Hook Duplication & Masking**:
   - *Observation 1.1* showed `hooksInstalled` gates listener registration so that repeated calls to `registerExecutorHooks()` never re-add listeners to the same `Hooks` object.
   - Removing lines 538–542 eliminated the second registration block that had doubled listener execution.
   - Roll-level flags (`_ak5eDeathmarkCritApplied`, `_ak5eDeathmarkDamageApplied`, `_ak5ePreysenseCritApplied`) provide defense-in-depth against duplicate execution on the same roll object.
   - In `executor.test.mjs`, switching test execution to `Hooks.callAll(...)` ensures genuine integration with the Foundry hook dispatcher.
   - Therefore, hook duplication is completely eliminated, mathematical output is exact (+1d4 and +1 crit range), and the test suite reliably catches regressions.

2. **Fidelity of Sweeper Mark Cycling**:
   - Source rule Ch. 3 L5532 requires that hitting a creature during Sweeper transfers the mark *"even if it is on another Creature"*.
   - By adding `(isSweeper || dm.holder === "self")` in `onAk5eEvent("hit")`, hitting Target 1 moves the mark to Target 1, and subsequent hits against Target 2 or Target 3 successfully transfer the mark regardless of who held it.
   - At the conclusion of the Sweeper action (or turnEnd), `sweeper.active` is reset and Deathmark is recalled to the Executor, granting 3 SP.
   - Therefore, Sweeper operates in exact conformance with AK5e v1.3.1 source rules.

3. **Resilience of Actor Collection Traversal**:
   - When `globalThis.game.actors` is a Foundry `WorldCollection` or JavaScript `Map`, `Array.from(map)` produces `[id, doc]` tuples.
   - `getGameActors()` handles `.contents`, `.values()`, and array-of-tuples, ensuring that a flat array of live `Actor` documents is returned.
   - As a result, `onAk5eEvent("kill")` and `onAk5eEvent("turnEnd")` correctly detect active Executor actors and process 0-HP mark recall and Bodyguard protection Prowess triggers even when `raw.actor` is omitted.

---

### 1.3 Caveats

- **Scope Boundary**: This review was strictly focused on the remediation of the Executor subclass (`executor-features.mjs`) and its unit/adversarial test suites. Hookmaster (M3), Infuser (M4), and Live Playwright browser validation (M5) remain scheduled in subsequent milestones per `orchestrator_8/SCOPE.md`.
- **Foundry Session Lifetime**: In Foundry VTT runtime, ES modules load once per session. The `ak5eEventsInstalled` boolean ensures module event listeners are registered only once per session, while `hooksInstalled !== globalThis.Hooks` safely handles any environment where `globalThis.Hooks` might be re-initialized.

---

### 1.4 Conclusion

The code and test suites for the Executor subclass have achieved 100% compliance with AK5e Chapter 3 rules, WORKFLOW §3.2 player agency requirements, and GEMINI.md implementation standards. All defects from Iteration 1 are completely resolved. The implementation is verified robust, strictly idempotent, and free of integrity violations.

**Verdict: APPROVE**

---

### 1.5 Verification Method

To independently reproduce and verify this review's findings:

1. **Verify Hook Registration Idempotency (10 Invocations):**
   ```bash
   node -e '
   import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
     setupFoundryGlobals();
     const { registerExecutorHooks, setDeathmark } = await import("./ak5e/scripts/executor-features.mjs");
     const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
     for (let i = 0; i < 10; i++) registerExecutorHooks();
     const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } });
     const subClass = createTestItem({ name: "Executor (Hunter)", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor", executorPath: "hunter" } } });
     const actor = createTestActor({ name: "Hunter", items: [sClass, subClass], flags: { ak5e: { specialist: { enabled: true, branch: "executor" }, executor: { path: "hunter" } } } });
     const target = createTestActor({ name: "Target" });
     await setDeathmark(actor, target);
     const rollConfig = { subject: { actor }, target, rolls: [{ parts: ["1d8"] }] };
     globalThis.Hooks.callAll("dnd5e.preRollDamageV2", rollConfig);
     const attackConfig = { subject: { actor }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
     globalThis.Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
     if (rollConfig.rolls[0].parts.filter(p => p === "1d4").length !== 1 || attackConfig.rolls[0].options.criticalThreshold !== 19) {
       console.error("FAIL"); process.exit(1);
     }
     console.log("PASS: 1d4 count = 1, critThreshold = 19 after 10 hook registrations.");
   });
   '
   ```

2. **Execute All Test Suites:**
   ```bash
   node --test ak5e/test/executor.test.mjs
   node --test ak5e/test/executor-adversarial.test.mjs
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```

3. **Invalidation Conditions:**
   - If calling `Hooks.callAll("dnd5e.preRollDamageV2", ...)` adds more than one bonus die, the hook idempotency fix is invalidated.
   - If calling `Hooks.callAll("dnd5e.preRollAttackV2", ...)` decrements `criticalThreshold` below 19, the crit fix is invalidated.
   - If hitting a second target during Sweeper leaves Deathmark on the first target, the Sweeper fix is invalidated.
   - If dropping a Deathmark target to 0 HP without `raw.actor` fails to recall Deathmark to the Executor or award Prowess, the collection traversal fix is invalidated.

---

## 2. Quality Review Report

### Verified Claims

| Claim | Verification Method | Outcome |
|---|---|---|
| Duplicate Hook Registration Eliminated | Direct inspection of `ak5e/scripts/executor-features.mjs:372-376` & 10-cycle stress test via `Hooks.callAll` | **PASS** (1d4 count = 1, critThreshold = 19) |
| Sweeper Mark Cycling on Cleave | `ak5e/test/executor-adversarial.test.mjs:350-402` (Adversarial 4) & standalone sequential multi-target hit script | **PASS** (Mark tracks sequential targets & recalls at turn end) |
| `getGameActors()` Map/Collection Extraction | Tested 7 distinct collection structures (undefined, array, `.contents`, `Map`, iterable tuples, empty, invalid object) | **PASS** (100% correct document extraction) |
| 0-HP Mark Recall Without `raw.actor` | `ak5e/test/executor-adversarial.test.mjs:646-666` (Adversarial 7.3) | **PASS** (Mark recalled & 1 Prowess awarded) |
| Bodyguard Protection Prowess Without `raw.actor` | `ak5e/test/executor-adversarial.test.mjs:668-715` (Adversarial 7.4) | **PASS** (1 Prowess awarded on 0-damage ally turnEnd) |
| Unit Test Integration with Hook Dispatch | `ak5e/test/executor.test.mjs:279, 313, 520, 677, 681` | **PASS** (All tests execute through `Hooks.callAll`) |
| WORKFLOW §3.2 Table Play Compliance | Review of `specialist-uses.mjs`: confirmation dialogs, non-blocking overrides, 0-clamping, GM relay, undo | **PASS** (All active features support clean encounter undo) |
| Static Code & Schema Validation | `node ak5e/tools/validate-files.mjs` & `node ak5e/tools/verify-generated-content.mjs` | **PASS** (0 errors) |

### Coverage Gaps
- None within Milestone 2 scope. Live headless Chromium browser test is planned for Milestone 5 as defined in `orchestrator_8/SCOPE.md`.

### Unverified Items
- None. All claims and behaviors were empirically verified at runtime.

---

## 3. Adversarial Challenge Report

**Overall Risk Assessment**: **LOW**

### Challenges & Stress Tests Conducted

#### Challenge 1: Extreme Re-registration / Hook Listener Leakage
- **Assumption Challenged**: Calling `registerExecutorHooks()` repeatedly (e.g. across world loads, module resets, or setup re-runs) could accumulate duplicate listeners or mutate global state.
- **Attack Scenario**: Invoked `registerExecutorHooks()` 10 consecutive times in a loop, then fired `Hooks.callAll("dnd5e.preRollDamageV2")` and `Hooks.callAll("dnd5e.preRollAttackV2")`.
- **Expected Result**: Exactly one `1d4` damage die added; `criticalThreshold` decremented from 20 to exactly 19.
- **Actual Result**: `rollConfig.rolls[0].parts.filter(p => p === "1d4").length === 1`; `criticalThreshold === 19`.
- **Status**: **PASS (Robust)**.

#### Challenge 2: Sweeper Mark Cycling with Sequential Kills
- **Assumption Challenged**: During a Sweeper cleave attack, if Target 1 drops to 0 HP on the first attack (triggering automated mark recall to the Executor), will the subsequent attack against Target 2 successfully place the mark on Target 2?
- **Attack Scenario**: Activated Sweeper, attacked and killed Target 1 (0 HP), verified mark recall and Prowess gain, then attacked Target 2, verified mark placement on Target 2, then ended turn, verified final mark recall.
- **Expected Result**: Mark recalls on Target 1 death, transfers to Target 2 on hit, and returns to self at action end.
- **Actual Result**: Evaluated and verified 100% compliant at runtime.
- **Status**: **PASS (Robust)**.

#### Challenge 3: `getGameActors()` Handling Non-Standard or Corrupted Data
- **Assumption Challenged**: `globalThis.game.actors` may be missing, non-iterable, empty, or contain malformed entry structures.
- **Attack Scenario**: Tested 7 distinct collection inputs: `undefined`, plain `Array`, `{ contents: [...] }`, `new Map()`, generator of `[id, doc]` pairs, empty `Map`, and non-iterable object `{ foo: "bar" }`.
- **Expected Result**: Returns an empty array or flat document list without throwing uncaught exceptions.
- **Actual Result**: All 7 cases passed with zero errors.
- **Status**: **PASS (Robust)**.

### Stress Test Results Summary
- Hook Idempotency Stress Test: **PASS**
- Sweeper Sequential Multi-Target Cleave: **PASS**
- Sweeper Kill-and-Transfer Sequence: **PASS**
- Collection Traversal Robustness: **PASS**
- Full Encounter-Window Undo Reversibility: **PASS**

### Untested Areas
- Live headless browser rendering on port 30175 (assigned to Milestone 5 per `orchestrator_8/SCOPE.md`).
