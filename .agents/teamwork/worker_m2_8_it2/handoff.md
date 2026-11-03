# Handoff Report: Milestone 2 Iteration 2 (Specialist Executor Remediation)

**Agent Role**: Remediation Implementer (Milestone 2 Iteration 2)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m2_8_it2/`  
**Modified Files**:
- `ak5e/scripts/executor-features.mjs`
- `ak5e/test/executor.test.mjs`

---

## 1. Observation

1. **Pre-Remediation Baseline Adversarial Test Failures (`ak5e/test/executor-adversarial.test.mjs`):**
   - Command: `node --test ak5e/test/executor-adversarial.test.mjs`
   - Verbatim Output:
     ```text
     ✖ Adversarial 4: Sweeper mark cycle: attacking multiple targets in sequence (Deathmark moves to hit targets and returns to self at action end) (2.373299ms)
       AssertionError [ERR_ASSERTION]: Target 2 MUST gain Deathmark when hit during Sweeper, even if it is on another Creature (Ch. 3 L5532)
       + actual - expected
       + 'Actor.rnd_eacy8rtwccs'
       - 'Actor.rnd_xyqicd8y0p'
     
     ✖ Adversarial 7.3: Prowess gain: game.actors Collection traversal on kill event without raw.actor (0.495976ms)
       AssertionError [ERR_ASSERTION]: Executor Deathmark MUST be recalled when marked creature dies, even if raw.actor was not provided (traversing game.actors)
       false !== true

     ✖ Adversarial 7.4: Prowess gain: Bodyguard ally 0 dmg trigger with game.actors Collection (0.619693ms)
       AssertionError [ERR_ASSERTION]: Bodyguard gains 1 Prowess when protected ally takes 0 damage after being attacked within 10 ft (traversing game.actors)
       0 !== 1

     ℹ tests 11, pass 8, fail 3
     ```

2. **Pre-Remediation Hook Duplication and Threshold Inflation:**
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
       console.log("Damage parts:", rollConfig.rolls[0].parts);
       const attackConfig = { subject: { actor }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
       globalThis.Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
       console.log("Crit threshold:", attackConfig.rolls[0].options.criticalThreshold);
     });
     '
     ```
   - Verbatim Output:
     ```text
     Damage parts: [ '1d8', '1d4', '1d4' ]
     Crit threshold: 18
     ```

3. **Code Changes Applied to `ak5e/scripts/executor-features.mjs`:**
   - Added module-level `hooksInstalled` and `getGameActors()` helper function (lines 21–38) handling plain Arrays, Collections with `.contents`, Maps with `.values()`, and iterable `[key, document]` entries.
   - Added per-roll idempotency guard in `executorPreRollAttack` (`roll.options._ak5eDeathmarkCritApplied`) preventing multiple critical threshold reductions on the same roll.
   - Added per-roll idempotency guard in `executorPreRollDamage` (`roll._ak5eDeathmarkDamageApplied` and `roll._ak5ePreysenseCritApplied`) preventing duplicate bonus dice additions.
   - In `registerExecutorHooks()`: gated D&D5e hook registration with `if (globalThis.Hooks?.on && hooksInstalled !== globalThis.Hooks)`, and deleted the duplicate hook registration block at the end of the function.
   - In `onAk5eEvent("hit")`: allowed mark transfer on hit when `sweeper.active` is true even if `dm.holder === "target"` (per Ch. 3 L5532), and updated `currentDm` check for the `attackedOrDamagedThisTurn` flag.
   - In `onAk5eEvent("kill")` and `onAk5eEvent("turnEnd")`: used `getGameActors()` instead of `Array.from(globalThis.game?.actors ?? [])` to ensure valid document extraction from Maps/Collections.

4. **Code Changes Applied to `ak5e/test/executor.test.mjs`:**
   - Made Area 4 async, dispatched damage evaluation through `await Hooks.callAll("dnd5e.preRollDamageV2", ...)`, and asserted exact frequency (`filter(p => p === "1d4").length === 1`).
   - Updated Area 5 to dispatch through `await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig)` and asserted critical threshold is exactly 19.
   - Updated Area 10 to dispatch through `await Hooks.callAll("dnd5e.preRollDamageV2", critConfig)` and asserted exact critical die frequency (`filter(p => p === "1d10").length === 2`).
   - Added Area 14 verifying hook registration idempotency across multiple `registerExecutorHooks()` calls and Sweeper multi-target mark cycling.

5. **Post-Remediation Verification Results:**
   - `node --test ak5e/test/executor-adversarial.test.mjs`:
     ```text
     ✔ Adversarial 1: Deathmark state transitions: invalid target, self-target, multi-target transition, already-held recall (12.371819ms)
     ✔ Adversarial 2: Resource shortfall overrides: expending Prowess when pool is 0 with override (clamped at 0 & logged) (3.674061ms)
     ✔ Adversarial 3: Reaction override: Smokescreen, Blade Shield, Dangersense when reaction is 0 with override (4.973161ms)
     ✔ Adversarial 4: Sweeper mark cycle: attacking multiple targets in sequence (Deathmark moves to hit targets and returns to self at action end) (2.337541ms)
     ✔ Adversarial 5: Preysense Bleeding condition: applied on critical hit to living targets, NOT applied to Constructs or Undead (1.21002ms)
     ✔ Adversarial 6: Mortal Blow HP loss: DEX save vs Martial DC, 10d8 roll, double HP loss when Bleeding, and readings (2.60437ms)
     ✔ Adversarial 7.1: Prowess gain: marked 0 HP drop with 1/turn limit and turnStart reset (1.202043ms)
     ✔ Adversarial 7.2: Prowess gain: Hunter >= 30 damage single attack trigger (0.593313ms)
     ✔ Adversarial 7.3: Prowess gain: game.actors Collection traversal on kill event without raw.actor (0.49251ms)
     ✔ Adversarial 7.4: Prowess gain: Bodyguard ally 0 dmg trigger with game.actors Collection (0.653597ms)
     ✔ Adversarial 8: Full encounter-window undo reversibility for every plan (4.70076ms)
     ℹ tests 11, pass 11, fail 0
     ```
   - `node --test ak5e/test/executor.test.mjs`:
     ```text
     ✔ Area 1: Executor Identification & Path Choice (3.847643ms)
     ✔ Area 2: Deathmark Transfer & Recall State Machine (8.151747ms)
     ✔ Area 3: Combat SP Grants & Disengage Reaction (1.738116ms)
     ✔ Area 4: Damage Scaling (+1d4, +2d4, +3d4) (1.515793ms)
     ✔ Area 5: Hunter Crit Range (+1) vs Bodyguard Attack Redirection (1.502568ms)
     ✔ Area 6: Level 5: In Every Shadow (0.786672ms)
     ✔ Area 7: Level 5: Sweeper (Hunter) (3.331437ms)
     ✔ Area 8: Level 5: Smokescreen (Bodyguard) (1.631814ms)
     ✔ Area 9: Executor Prowess Gain Triggers (1.704884ms)
     ✔ Area 10: Level 11: Preysense (Hunter) & Dangersense (Bodyguard) (2.29544ms)
     ✔ Area 11: Level 15: In for the Kill (Hunter) & Blade Shield (Bodyguard) (1.597208ms)
     ✔ Area 12: Level 20: Mortal Blow (Hunter) & Ultimate Sword and Shield (Bodyguard) (1.041197ms)
     ✔ Area 13: Full Encounter-Window Undo Reversibility (WORKFLOW §3.2) (1.632425ms)
     ✔ Area 14: Hook Idempotency & Sweeper Mark Transfer Regression (0.846305ms)
     ℹ tests 14, pass 14, fail 0
     ```
   - Full specialist test suite (`specialist-rules`, `specialist-features`, `specialist-progression`, `specialist-adversarial`, `executor`, `executor-adversarial`): 73 tests passed, 0 failures.
   - `node ak5e/tools/validate-files.mjs`: Validated module.json, lang/en.json, and 270 .mjs files (Clean PASS).
   - `node ak5e/tools/verify-generated-content.mjs`: Verified all generated Chapter 1–6 records (2193 records; Clean PASS).

---

## 2. Logic Chain

1. **Elimination of Hook Duplication & Listener Leakage:**
   - In `ak5e/scripts/executor-features.mjs`, `registerExecutorHooks()` previously contained two registration blocks for `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2`, and the first was outside `ak5eEventsInstalled`.
   - By gating `Hooks.on` registration behind `hooksInstalled !== globalThis.Hooks`, tracking `hooksInstalled = globalThis.Hooks`, and removing lines 538–542, exactly one listener per hook is attached per `Hooks` instance regardless of how many times `registerExecutorHooks()` is called.
   - Additionally, per-roll flags `_ak5eDeathmarkCritApplied`, `_ak5eDeathmarkDamageApplied`, and `_ak5ePreysenseCritApplied` provide defense-in-depth, ensuring that even if an external caller dispatches multiple times, bonus dice and threshold reductions are applied at most once per roll.
   - Updating `executor.test.mjs` Areas 4, 5, and 10 to dispatch through `Hooks.callAll` ensures that live hook integration is directly exercised and verified.

2. **Restoration of Sweeper Multi-Target Mark Cycling:**
   - Per AK5e Chapter 3 line 5532: *"If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature."*
   - In `onAk5eEvent("hit")`, checking `isSweeper || dm.holder === "self"` ensures that when `sweeper.active` is true, Deathmark is transferred to the newly hit creature even if it was previously placed on another creature from an earlier attack within the same Sweeper action.
   - This directly resolves Adversarial Test 4.

3. **Restoration of Actor Collection Traversal in Kill & TurnEnd:**
   - In Foundry VTT, `game.actors` is a `Collection` extending `Map`. Standard `Array.from(map)` yields `[id, doc]` pairs where `isExecutor(actor)` failed.
   - The helper `getGameActors()` checks for `actors.contents`, `actors.values()`, and array-of-tuples, extracting the actual Actor document instances.
   - When a monster drops to 0 HP or a protected ally takes 0 damage, `onAk5eEvent("kill")` and `onAk5eEvent("turnEnd")` accurately discover all active Executor actors in the world.
   - This directly resolves Adversarial Tests 7.3 and 7.4.

---

## 3. Caveats

- **No Unrelated Changes**: Only the assigned files (`ak5e/scripts/executor-features.mjs` and `ak5e/test/executor.test.mjs`) were modified.
- **Milestone Scope**: This remediation is strictly bounded to the Executor subclass (Milestone 2 Iteration 2). Subsequent milestones (Hookmaster M3, Infuser M4, and Live Playwright browser validation M5) remain planned.

---

## 4. Conclusion

All defects that caused the Milestone 2 Iteration 1 failure (Integrity Violation and Request Changes) have been completely resolved:
1. Hook duplicate registration and listener leakage eliminated; verified single evaluation and exact mathematical output.
2. Sweeper mark cycling across sequential targets restored per Chapter 3 L5532.
3. Collection/Map traversal in `kill` and `turnEnd` restored.
4. All 11 adversarial tests and all 14 unit tests pass cleanly (100% success rate across 73 specialist tests).

---

## 5. Verification Method

To independently verify the implementation and test results:

```bash
# 1. Run all 11 adversarial stress tests (including Sweeper mark cycling & collection traversal):
node --test ak5e/test/executor-adversarial.test.mjs

# 2. Run all 14 unit tests (including live Hooks.callAll dispatch and Area 14 idempotency):
node --test ak5e/test/executor.test.mjs

# 3. Run full specialist regression suite:
node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs

# 4. Verify static quality checks:
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs

# 5. Direct verification of single hook execution and exact mathematics:
node -e '
import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
  setupFoundryGlobals();
  const { registerExecutorHooks, setDeathmark } = await import("./ak5e/scripts/executor-features.mjs");
  const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
  registerExecutorHooks();
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
  const attackConfig = { subject: { actor }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
  globalThis.Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  if (attackConfig.rolls[0].options.criticalThreshold !== 19) {
    console.error("FAIL: criticalThreshold is not 19:", attackConfig.rolls[0].options.criticalThreshold);
    process.exit(1);
  }
  console.log("PASS: Both damage parts and critical threshold verified exact.");
});
'
```

### Invalidation Conditions
- If calling `Hooks.callAll("dnd5e.preRollDamageV2", ...)` adds more than one bonus die, the hook idempotency fix is invalidated.
- If calling `Hooks.callAll("dnd5e.preRollAttackV2", ...)` decrements `criticalThreshold` below 19, the crit fix is invalidated.
- If hitting a second target during Sweeper leaves Deathmark on the first target, the Sweeper fix is invalidated.
- If dropping a Deathmark target to 0 HP without `raw.actor` fails to recall Deathmark to the Executor or award Prowess, the collection traversal fix is invalidated.
