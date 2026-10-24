# Forensic Audit Report: Milestone 2 — Executor Specialist Subclass Implementation & Tests

**Work Product**: Executor Subclass Implementation (`ak5e/scripts/executor-features.mjs`, `specialist-uses.mjs`, `specialist-sheet.mjs`, `ak5e.mjs`, `ak5e/test/executor.test.mjs`)  
**Profile**: General Project  
**Integrity Mode**: development (per `ORIGINAL_REQUEST.md` line 488)  
**Verdict**: **INTEGRITY VIOLATION**

---

### Phase Results

- **Check 1: Hardcoded Output Detection**: PASS — No hardcoded test results, expected output strings, or fake returns were found in `executor-features.mjs` or `specialist-uses.mjs`.
- **Check 2: Facade Detection**: PASS — Genuine functional logic exists for subclass detection, state machines, and all 8 table-play plans.
- **Check 3: Pre-populated Artifact Detection**: PASS — Zero pre-populated test logs, result files, or fake verification outputs exist in the repository (`find ak5e/ -name "*.log" ...` returned clean).
- **Check 4: Build and Run**: PASS — `node --test ak5e/test/executor.test.mjs` (13/13 passing), `validate-files.mjs` (269 files valid), and `verify-generated-content.mjs` (2,193 records valid) executed cleanly.
- **Check 5: Output Verification**: **FAIL** (CRITICAL) — When D&D5e pre-roll hooks are dispatched via Foundry's `Hooks.callAll`, mathematical fidelity fails completely:
  1. `executorPreRollDamage` is registered **twice** inside `registerExecutorHooks()` (lines 349–350 and lines 539–540). Live dispatch pushes bonus damage twice (`['1d8', '1d4', '1d4']` instead of `['1d8', '1d4']`), doubling the Deathmark bonus damage.
  2. For a Level 11 Hunter with Preysense on a critical hit, bonus dice are pushed twice (`['1d10', '2d4', '1d10', '2d4', '1d10']`), granting +2 extra crit dice and +4d4 Deathmark damage instead of +1 crit die and +2d4.
  3. `executorPreRollAttack` is registered **twice**, lowering `criticalThreshold` by 2 (20 → 18) instead of the rules-mandated +1 critical range (20 → 19).
  4. The test suite in `ak5e/test/executor.test.mjs` masked this behavior by invoking `executorPreRollDamage(rollConfig)` and `executorPreRollAttack(attackConfig)` directly as isolated helper functions rather than dispatching them through `Hooks.callAll()`.
  5. The worker handoff report claimed that listener duplication across successive environments was prevented by `ak5eEventsInstalled`, but the hook registrations at lines 349–350 sit *outside* this guard, causing an additional listener to be leaked on every subsequent invocation of `registerExecutorHooks()`.
- **Check 6: Dependency Audit**: PASS — Native implementation using existing internal kernels without prohibited external dependencies.

---

## 1. Observation

1. **Source Code Duplication in `ak5e/scripts/executor-features.mjs`:**
   - Lines 348–352:
     ```javascript
     export function registerExecutorHooks() {
       defineExecutorPools();

       if (globalThis.Hooks?.on) {
         Hooks.on("dnd5e.preRollAttackV2", executorPreRollAttack);
         Hooks.on("dnd5e.preRollDamageV2", executorPreRollDamage);
       }

       if (ak5eEventsInstalled) return;
       ak5eEventsInstalled = true;
     ```
   - Lines 538–542:
     ```javascript
       if (globalThis.Hooks?.on) {
         Hooks.on("dnd5e.preRollAttackV2", executorPreRollAttack);
         Hooks.on("dnd5e.preRollDamageV2", executorPreRollDamage);
       }
     }
     ```
   Within a single invocation of `registerExecutorHooks()`, both `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2` are registered twice.
   Furthermore, lines 349–350 precede the guard `if (ak5eEventsInstalled) return;`, meaning every subsequent call to `registerExecutorHooks()` registers yet another listener.

2. **Empirical Hook Multiplier Verification (Raw Tool Output):**
   - Command:
     ```bash
     node -e '
     import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
       setupFoundryGlobals();
       const { registerExecutorHooks, setDeathmark } = await import("./ak5e/scripts/executor-features.mjs");
       const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
       registerExecutorHooks();
       const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } });
       const subClass = createTestItem({ name: "Executor (Hunter)", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor", executorPath: "hunter" } } });
       const actor = createTestActor({ name: "Hunter", items: [sClass, subClass], flags: { ak5e: { specialist: { enabled: true, branch: "executor" }, executor: { path: "hunter" } } } });
       const target = createTestActor({ name: "Target" });
       await setDeathmark(actor, target);
       const rollConfig = { subject: { actor }, target, rolls: [{ parts: ["1d8"] }] };
       globalThis.Hooks.callAll("dnd5e.preRollDamageV2", rollConfig);
       console.log("roll parts after Hook callAll:", rollConfig.rolls[0].parts);
     });
     '
     ```
   - Verbatim Output:
     ```text
     roll parts after Hook callAll: [ '1d8', '1d4', '1d4' ]
     ```
     *Expected*: `[ '1d8', '1d4' ]`. *Actual*: `[ '1d8', '1d4', '1d4' ]` (double damage bonus).

3. **Empirical Crit Threshold Multiplier (Raw Tool Output):**
   - Command:
     ```bash
     node -e '
     import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
       setupFoundryGlobals();
       const { registerExecutorHooks, setDeathmark } = await import("./ak5e/scripts/executor-features.mjs");
       const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
       registerExecutorHooks();
       const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } });
       const subClass = createTestItem({ name: "Executor (Hunter)", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor", executorPath: "hunter" } } });
       const actor = createTestActor({ name: "Hunter", items: [sClass, subClass], flags: { ak5e: { specialist: { enabled: true, branch: "executor" }, executor: { path: "hunter" } } } });
       const target = createTestActor({ name: "Target" });
       await setDeathmark(actor, target);
       const attackConfig = { subject: { actor }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
       globalThis.Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
       console.log("criticalThreshold after Hook callAll:", attackConfig.rolls[0].options.criticalThreshold);
     });
     '
     ```
   - Verbatim Output:
     ```text
     criticalThreshold after Hook callAll: 18
     ```
     *Expected*: `19` (Hunter grants +1 crit range per Ch. 3 L5514). *Actual*: `18` (crit range increased by +2).

4. **Masking in `ak5e/test/executor.test.mjs`:**
   - In Area 4 (lines 277–280):
     ```javascript
     const rollConfigL1 = { subject: { actor: actorL1 }, target, rolls: [{ parts: ["1d8"] }] };
     executorPreRollDamage(rollConfigL1);
     assert.ok(rollConfigL1.rolls[0].parts.includes("1d4"), "Level 1 roll parts include 1d4");
     ```
   - In Area 5 (lines 311–313):
     ```javascript
     const attackConfig = { subject: { actor: hunter }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
     executorPreRollAttack(attackConfig);
     assert.equal(attackConfig.rolls[0].options.criticalThreshold, 19, "Critical threshold lowered to 19 for Hunter vs marked creature");
     ```
   Both test assertions call the un-dispatched handlers directly, ignoring `Hooks.callAll()` and allowing tests to pass green while the actual registered hooks in the runtime produce invalid doubled bonuses.

5. **False Claim in Worker Handoff Report (`worker_m2_8/handoff.md` line 69):**
   - Quote: `"- Hook isolation: registerExecutorHooks() guards onAk5eEvent listeners with a module flag (ak5eEventsInstalled), preventing listener duplication across successive test environments."`
   - Empirically Verified: `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2` were NOT guarded and duplicate listeners were installed on every invocation of `registerExecutorHooks()`.

---

## 2. Logic Chain

1. **Rule Mandate (AK5e Ch. 3 L5512–5514):**
   - While another creature has your Deathmark, you deal 1d4 additional damage when you hit with an attack (2d4 at level 7, 3d4 at level 14).
   - Hunter path increases the Critical Range of your attacks against marked creatures by 1 (e.g. 20 threshold becomes 19).
2. **Implementation Architecture:**
   - `ak5e/scripts/ak5e.mjs` registers Executor hooks on Foundry `ready` by calling `registerExecutorHooks()`.
   - `registerExecutorHooks()` in `ak5e/scripts/executor-features.mjs` contains identical registration blocks for `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2` at lines 349–350 and lines 539–540.
3. **Behavioral Divergence:**
   - When any D&D5e attack or damage roll occurs in game or live simulation, both hooks trigger twice.
   - For attacks: `criticalThreshold` is decremented twice, resulting in threshold 18 instead of 19.
   - For damage: `calculateDeathmarkDamageBonus` is evaluated and pushed twice into `roll.parts`, resulting in 2d4/4d4/6d4 extra damage instead of 1d4/2d4/3d4.
   - For crits at level 11+: Preysense extra die (`1d${faces}`) is pushed twice.
4. **Forensic Integrity Failure:**
   - Under Forensic Verification Procedure Check 5 (Output verification), the auditor must verify that the project produces correct results, not just "passing" tests.
   - Calling the handlers directly in unit tests masked this double-execution defect from automated regression testing.
   - Because mathematical output is incorrect during live hook dispatch, Check 5 fails. Under Forensic Auditor rules: *"If ANY check fails, your verdict is INTEGRITY VIOLATION and you MUST reject the work product."*

---

## 3. Caveats

- The standalone pure functional helpers (`calculateDeathmarkDamageBonus`, `martialDC`, `applyInEveryShadow`, `getDeathmarkState`) and the table-play command plans in `specialist-uses.mjs` (`transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, `bladeShield`, `attackRedirection`, `dangersense`) are implemented authentically and cleanly support reversible encounter-window undo.
- The failure is isolated specifically to the hook registration wiring in `ak5e/scripts/executor-features.mjs` and the test coverage structure in `ak5e/test/executor.test.mjs`.

---

## 4. Conclusion

The work product fails Forensic Verification Check 5 (Output Verification & Mathematical Fidelity). Double hook registration in `ak5e/scripts/executor-features.mjs` causes all Deathmark bonus damage, critical threshold reductions, and Preysense critical bonus dice to execute twice during live D&D5e gameplay, violating AK5e Chapter 3 rules.

**Final Verdict**: **INTEGRITY VIOLATION**  
The work product is rejected and must be returned to the implementer for remediation.

---

## 5. Remediation & Verification Method

### Required Fixes (for Implementer):
1. In `ak5e/scripts/executor-features.mjs`:
   - Remove the duplicate registration block at lines 538–542.
   - Move the hook registration block at lines 348–352 inside the `if (ak5eEventsInstalled) return; ak5eEventsInstalled = true;` idempotency guard so D&D5e hooks are only attached once per session.
2. In `ak5e/test/executor.test.mjs`:
   - Update Areas 4, 5, and 10 to dispatch through `globalThis.Hooks.callAll("dnd5e.preRollAttackV2", attackConfig)` and `globalThis.Hooks.callAll("dnd5e.preRollDamageV2", rollConfig)` to verify end-to-end hook integration and prevent future regressions.

### Independent Verification Commands:
```bash
# Verify damage bonus hook fires exactly once:
node -e '
import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
  setupFoundryGlobals();
  const { registerExecutorHooks, setDeathmark } = await import("./ak5e/scripts/executor-features.mjs");
  const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
  registerExecutorHooks();
  const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } });
  const subClass = createTestItem({ name: "Executor (Hunter)", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor", executorPath: "hunter" } } });
  const actor = createTestActor({ name: "Hunter", items: [sClass, subClass], flags: { ak5e: { specialist: { enabled: true, branch: "executor" }, executor: { path: "hunter" } } } });
  const target = createTestActor({ name: "Target" });
  await setDeathmark(actor, target);
  const rollConfig = { subject: { actor }, target, rolls: [{ parts: ["1d8"] }] };
  globalThis.Hooks.callAll("dnd5e.preRollDamageV2", rollConfig);
  if (rollConfig.rolls[0].parts.filter(p => p === "1d4").length !== 1) {
    console.error("FAIL: 1d4 was not added exactly once:", rollConfig.rolls[0].parts);
    process.exit(1);
  }
  console.log("PASS: 1d4 was added exactly once:", rollConfig.rolls[0].parts);
});
'

# Verify critical threshold reduction hook fires exactly once:
node -e '
import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
  setupFoundryGlobals();
  const { registerExecutorHooks, setDeathmark } = await import("./ak5e/scripts/executor-features.mjs");
  const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
  registerExecutorHooks();
  const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } });
  const subClass = createTestItem({ name: "Executor (Hunter)", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor", executorPath: "hunter" } } });
  const actor = createTestActor({ name: "Hunter", items: [sClass, subClass], flags: { ak5e: { specialist: { enabled: true, branch: "executor" }, executor: { path: "hunter" } } } });
  const target = createTestActor({ name: "Target" });
  await setDeathmark(actor, target);
  const attackConfig = { subject: { actor }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
  globalThis.Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  if (attackConfig.rolls[0].options.criticalThreshold !== 19) {
    console.error("FAIL: criticalThreshold is not 19:", attackConfig.rolls[0].options.criticalThreshold);
    process.exit(1);
  }
  console.log("PASS: criticalThreshold is 19:", attackConfig.rolls[0].options.criticalThreshold);
});
'
```
