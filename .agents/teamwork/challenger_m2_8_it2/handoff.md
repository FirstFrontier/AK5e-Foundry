# Adversarial Challenge Report: Milestone 2 Iteration 2 (Specialist Executor Remediation)

**Agent**: Empirical Challenger (`challenger_m2_8_it2`)  
**Roles**: Critic, Specialist  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m2_8_it2/`  
**Target Milestone**: Milestone 2 Iteration 2 (Executor Subclass Remediation)  
**Explicit Verdict**: **APPROVE**

---

## Challenge Summary

- **Overall Risk Assessment**: **LOW**
- **Prior Gate State**: Iteration 1 failed due to (1) duplicate D&D5e hook registration inflating damage and reducing critical threshold twice, (2) Sweeper mark transfer locked to Target 1, and (3) `game.actors` Map/Collection entry traversal failing in `kill` and `turnEnd` events.
- **Current Assessment**: The remediation in Iteration 2 thoroughly and accurately resolves all three defects. All 11 adversarial stress tests and all 14 unit tests pass with zero failures. Independent empirical probes confirmed defense-in-depth hook idempotency, Sweeper multi-target cycling across hits and misses, and complete robustness across 5 distinct Foundry `game.actors` collection shapes. Full regression suites (73 specialist tests, 71 kernel/pool tests, and static file validators) pass cleanly with zero regressions.

---

## 1. Observation

Direct tool executions and verified results:

1. **Adversarial Stress Test Suite (`ak5e/test/executor-adversarial.test.mjs`):**
   - Command: `node --test ak5e/test/executor-adversarial.test.mjs`
   - Output:
     ```text
     ✔ Adversarial 1: Deathmark state transitions: invalid target, self-target, multi-target transition, already-held recall (9.142611ms)
     ✔ Adversarial 2: Resource shortfall overrides: expending Prowess when pool is 0 with override (clamped at 0 & logged) (7.111706ms)
     ✔ Adversarial 3: Reaction override: Smokescreen, Blade Shield, Dangersense when reaction is 0 with override (4.961285ms)
     ✔ Adversarial 4: Sweeper mark cycle: attacking multiple targets in sequence (Deathmark moves to hit targets and returns to self at action end) (2.323863ms)
     ✔ Adversarial 5: Preysense Bleeding condition: applied on critical hit to living targets, NOT applied to Constructs or Undead (1.232972ms)
     ✔ Adversarial 6: Mortal Blow HP loss: DEX save vs Martial DC, 10d8 roll, double HP loss when Bleeding, and readings (2.725219ms)
     ✔ Adversarial 7.1: Prowess gain: marked 0 HP drop with 1/turn limit and turnStart reset (1.185822ms)
     ✔ Adversarial 7.2: Prowess gain: Hunter >= 30 damage single attack trigger (0.705025ms)
     ✔ Adversarial 7.3: Prowess gain: game.actors Collection traversal on kill event without raw.actor (0.608902ms)
     ✔ Adversarial 7.4: Prowess gain: Bodyguard ally 0 dmg trigger with game.actors Collection (0.709022ms)
     ✔ Adversarial 8: Full encounter-window undo reversibility for every plan (4.716929ms)
     ℹ tests 11, pass 11, fail 0
     ```

2. **Unit Test Suite (`ak5e/test/executor.test.mjs`):**
   - Command: `node --test ak5e/test/executor.test.mjs`
   - Output:
     ```text
     ✔ Area 1: Executor Identification & Path Choice (3.851187ms)
     ✔ Area 2: Deathmark Transfer & Recall State Machine (4.91683ms)
     ✔ Area 3: Combat SP Grants & Disengage Reaction (1.744809ms)
     ✔ Area 4: Damage Scaling (+1d4, +2d4, +3d4) (1.495554ms)
     ✔ Area 5: Hunter Crit Range (+1) vs Bodyguard Attack Redirection (1.532273ms)
     ✔ Area 6: Level 5: In Every Shadow (0.809905ms)
     ✔ Area 7: Level 5: Sweeper (Hunter) (3.339952ms)
     ✔ Area 8: Level 5: Smokescreen (Bodyguard) (1.62022ms)
     ✔ Area 9: Executor Prowess Gain Triggers (5.094519ms)
     ✔ Area 10: Level 11: Preysense (Hunter) & Dangersense (Bodyguard) (2.498327ms)
     ✔ Area 11: Level 15: In for the Kill (Hunter) & Blade Shield (Bodyguard) (1.617786ms)
     ✔ Area 12: Level 20: Mortal Blow (Hunter) & Ultimate Sword and Shield (Bodyguard) (1.062788ms)
     ✔ Area 13: Full Encounter-Window Undo Reversibility (WORKFLOW §3.2) (1.656691ms)
     ✔ Area 14: Hook Idempotency & Sweeper Mark Transfer Regression (0.860061ms)
     ℹ tests 14, pass 14, fail 0
     ```

3. **Full Specialist Test Suite Regression:**
   - Command: `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs`
   - Output: `tests 73, pass 73, fail 0, duration_ms ~207ms`. Clean pass.

4. **Resource Pools & Operation Kernel Regression:**
   - Command: `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs`
   - Output: `tests 71, pass 71, fail 0, duration_ms ~207ms`. Clean pass.

5. **Static File and Source Content Validation:**
   - Command: `node ak5e/tools/validate-files.mjs && node ak5e/tools/verify-generated-content.mjs`
   - Output:
     ```text
     Validated module.json, lang/en.json, and 270 .mjs files.
     Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
     Top-level records: 2193; Chapter 6 embedded features: 801.
     ```

6. **Adversarial Empirical Probe Execution:**
   - Tested `getGameActors()` across 5 distinct shapes of `game.actors`: (1) undefined -> `[]`, (2) Array -> returned directly, (3) Collection with `.contents` -> `contents` returned, (4) Map with `.values()` -> values returned, (5) Iterable returning `[key, doc]` tuples -> doc values extracted. All 5 verified.
   - Tested defense-in-depth per-roll flags `_ak5eDeathmarkCritApplied` and `_ak5eDeathmarkDamageApplied`: repeated execution on the same roll configuration adds 0 duplicate bonus dice and leaves critical threshold at 19.
   - Tested Sweeper sequence with Miss vs Hit: Attack miss on Target B keeps Deathmark on Target A; Hit on Target B transfers mark to Target B; Hit on Target C transfers mark to Target C; turn end recalls mark and grants +3 SP.
   - Tested Bodyguard ally 0 damage prowess trigger boundaries: ally attacked taking 0 damage at distance 10 ft triggers +1 Prowess; ally at distance 11 ft does NOT trigger; Bodyguard self taking 0 damage does NOT trigger. All verified.

---

## 2. Logic Chain

1. **Resolution of Blocker 1 (Duplicate Hook Registration & Threshold Inflation):**
   - *Observation*: In `ak5e/scripts/executor-features.mjs`, `registerExecutorHooks()` was refactored with `if (globalThis.Hooks?.on && hooksInstalled !== globalThis.Hooks)` tracking module-level `hooksInstalled`. The duplicate registration block at lines 538–542 in Iteration 1 was deleted. Furthermore, `executorPreRollAttack` sets `roll.options._ak5eDeathmarkCritApplied = true`, and `executorPreRollDamage` sets `roll._ak5eDeathmarkDamageApplied = true` and `roll._ak5ePreysenseCritApplied = true`.
   - *Inference*: Even if `registerExecutorHooks()` is invoked repeatedly, or if `Hooks.callAll` is dispatched multiple times by external modules, each hook listener is attached exactly once per `Hooks` object, and each roll applies bonus dice and threshold reductions at most once.
   - *Conclusion*: Blocker 1 is completely resolved.

2. **Resolution of Blocker 2 (Sweeper Multi-Target Mark Cycling):**
   - *Observation*: In `ak5e/scripts/executor-features.mjs` lines 417–425:
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
   - *Inference*: Per AK5e Chapter 3 line 5532, hitting a creature during Sweeper transfers Deathmark *"even if it is on another Creature"*. Gating transfer on `(isSweeper || dm.holder === "self")` ensures that when Sweeper is active, hitting sequential targets (Target 1, Target 2, Target 3) successfully transfers the mark on each hit without getting stuck on Target 1. When the action ends (`turnEnd`), Deathmark returns to the Executor with +3 SP.
   - *Conclusion*: Blocker 2 is completely resolved.

3. **Resolution of Blocker 3 (`game.actors` Map/Collection Traversal):**
   - *Observation*: In `ak5e/scripts/executor-features.mjs` lines 24–38, `getGameActors()` interrogates `game.actors` for `.contents`, `.values()`, and tuple iterators `[id, doc]`.
   - *Inference*: In Foundry VTT, `game.actors` is a Collection extending `Map`. Default `Array.from(map)` yields `[id, doc]` pairs where `isExecutor(pair)` fails. `getGameActors()` unwraps the actual document instances, ensuring that kill events (`onAk5eEvent("kill")`) and ally turn end events (`onAk5eEvent("turnEnd")`) reliably discover all active Executors in the world.
   - *Conclusion*: Blocker 3 is completely resolved.

4. **Table-Play Philosophy & Undo Integrity (WORKFLOW §3.2):**
   - *Observation*: Adversarial Test 8 and Unit Test Area 13 exercise the complete encounter-window undo reversibility for `transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, and `bladeShield`.
   - *Inference*: All operations snapshot prior resource values and flags, store structured receipts under `flags.ak5e.specialistUses.undo`, and restore prior state idempotently. Shortfall overrides clamp resources at 0 floor without corrupting subsequent undo operations.
   - *Conclusion*: Conforms strictly to WORKFLOW §3.2.

---

## 3. Caveats

- **Scope Boundary**: This review covers the Executor subclass remediation (Milestone 2 Iteration 2). Hookmaster (Milestone 3), Infuser (Milestone 4), and live browser validation (Milestone 5) are separate milestones and were not evaluated in this iteration.
- **Foundry Live Session**: Live in-Foundry Playwright browser validation with UI rendering and screenshot capture is scheduled for Milestone 5 as defined in `SCOPE.md`.

---

## 4. Conclusion & Final Verdict

All 3 defect blockers identified in Iteration 1 have been completely resolved, verified empirically with zero test failures, and validated against edge cases with standalone empirical probe execution.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. Run the adversarial stress test suite:
   ```bash
   node --test ak5e/test/executor-adversarial.test.mjs
   ```
2. Run the executor unit test suite:
   ```bash
   node --test ak5e/test/executor.test.mjs
   ```
3. Run the full specialist test regression:
   ```bash
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs
   ```
4. Run static validation tools:
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```

### Invalidation Conditions
- Any failure in `ak5e/test/executor-adversarial.test.mjs` or `ak5e/test/executor.test.mjs`.
- Adding extra bonus dice or decrementing critical threshold below 19 on multiple hook evaluations.
- Failure of Deathmark to transfer to subsequent targets during Sweeper hits.
- Failure of kill or turnEnd events to locate Executors in `game.actors`.
