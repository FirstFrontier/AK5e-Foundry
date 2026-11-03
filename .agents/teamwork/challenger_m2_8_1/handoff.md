# Adversarial Challenge Report: Milestone 2 — Executor Subclass Implementation & Tests

**Verdict:** **REQUEST_CHANGES**

## 1. Observation

- **Test Suite Execution:**
  Authored and executed `ak5e/test/executor-adversarial.test.mjs` containing 11 tests across the 8 assigned stress-test dimensions:
  Command: `node --test ak5e/test/executor-adversarial.test.mjs`
  ```text
  ✔ Adversarial 1: Deathmark state transitions: invalid target, self-target, multi-target transition, already-held recall (12.601097ms)
  ✔ Adversarial 2: Resource shortfall overrides: expending Prowess when pool is 0 with override (clamped at 0 & logged) (3.645727ms)
  ✔ Adversarial 3: Reaction override: Smokescreen, Blade Shield, Dangersense when reaction is 0 with override (4.901874ms)
  ✖ Adversarial 4: Sweeper mark cycle: attacking multiple targets in sequence (Deathmark moves to hit targets and returns to self at action end) (2.369362ms)
  ✔ Adversarial 5: Preysense Bleeding condition: applied on critical hit to living targets, NOT applied to Constructs or Undead (1.160635ms)
  ✔ Adversarial 6: Mortal Blow HP loss: DEX save vs Martial DC, 10d8 roll, double HP loss when Bleeding, and readings (1.99121ms)
  ✔ Adversarial 7.1: Prowess gain: marked 0 HP drop with 1/turn limit and turnStart reset (2.126778ms)
  ✔ Adversarial 7.2: Prowess gain: Hunter >= 30 damage single attack trigger (0.588052ms)
  ✖ Adversarial 7.3: Prowess gain: game.actors Collection traversal on kill event without raw.actor (0.496908ms)
  ✖ Adversarial 7.4: Prowess gain: Bodyguard ally 0 dmg trigger with game.actors Collection (0.582371ms)
  ✔ Adversarial 8: Full encounter-window undo reversibility for every plan (4.486652ms)
  ℹ tests 11
  ℹ suites 0
  ℹ pass 8
  ℹ fail 3
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 180.272709
  ```

- **Defect 1 Observations (Sweeper Multi-Target Mark Cycle Failure):**
  - Source Rules Authority (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L5532):
    > "Hunter (Sweeper). While you are Hiding or Invisible, you can expend 1 Prowess as an Action. If you do so, until the end of the Turn your Reach is increased by 5 feet, and you may immediately make a Melee Attack against each Creature of your Choice within your Reach; you can only make one Attack against each Creature. If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature. At the end of the Action, your Deathmark returns to you."
  - Implementation in `ak5e/scripts/executor-features.mjs`:
    Lines 366–371 (`onAk5eEvent("attack")`):
    ```javascript
    // Mark transfer on attack roll reading
    if (dm.holder === "self" && targetUuid) {
      const timing = globalThis.game?.ak5e?.specialist?.ruling?.(actor, "deathmarkTransferTiming") ?? "onAttackRoll";
      if (timing === "onAttackRoll") {
        await setDeathmark(actor, { uuid: targetUuid, name: targetName });
      }
    }
    ```
    Lines 392–397 (`onAk5eEvent("hit")`):
    ```javascript
    // Mark transfer on hit reading
    if (dm.holder === "self" && targetUuid) {
      const timing = globalThis.game?.ak5e?.specialist?.ruling?.(actor, "deathmarkTransferTiming") ?? "onAttackRoll";
      if (timing === "onHitOnly") {
        await setDeathmark(actor, { uuid: targetUuid, name: targetName });
      }
    }
    ```
  - Verbatim Test Failure (`ak5e/test/executor-adversarial.test.mjs:376`):
    ```text
    AssertionError [ERR_ASSERTION]: Target 2 MUST gain Deathmark when hit during Sweeper, even if it is on another Creature (Ch. 3 L5532)
    + actual - expected
    + 'Actor.rnd_jdj5fbxl8e'  // Target 1
    - 'Actor.rnd_nx3k7hf647q' // Target 2
    ```

- **Defect 2 Observations (`game.actors` Map/Collection Entry Traversal in `kill` and `turnEnd`):**
  - Source Rules Authority (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L5536, L5540):
    > "As an Executor, you gain 1 Prowess when a Creature with your Deathmark is reduced to 0 Hit Points. Once you have gained Prowess in this way, you may not do so again until the beginning of your next Turn."
    > "Bodyguard: At the end of an allied Creature's Turn where they were Attacked while within 10 feet of you, but have taken no Damage from hostile Creatures that Turn, you gain 1 Prowess."
  - Implementation in `ak5e/scripts/executor-features.mjs`:
    Lines 447–451:
    ```javascript
    const candidates = Array.from(globalThis.game?.actors ?? []);
    if (event.raw?.actor && !candidates.includes(event.raw.actor)) candidates.push(event.raw.actor);

    for (const actor of candidates) {
      if (!isExecutor(actor)) continue;
    ```
    Lines 524–527:
    ```javascript
    const actors = Array.from(globalThis.game?.actors ?? []);
    for (const bgActor of actors) {
      if (!isExecutor(bgActor) || getExecutorPath(bgActor) !== EXECUTOR_PATHS.BODYGUARD || specialistLevel(bgActor) < 5) continue;
    ```
  - Verbatim Test Failures (`ak5e/test/executor-adversarial.test.mjs:656`, `ak5e/test/executor-adversarial.test.mjs:680`):
    ```text
    AssertionError [ERR_ASSERTION]: Executor Deathmark MUST be recalled when marked creature dies, even if raw.actor was not provided (traversing game.actors)
    false !== true
    
    AssertionError [ERR_ASSERTION]: Bodyguard gains 1 Prowess when protected ally takes 0 damage after being attacked within 10 ft (traversing game.actors)
    0 !== 1
    ```

- **Passing Stress Dimensions (Verified Working):**
  1. *Deathmark state transitions:* Target-less transfer and self-transfer throw `target` warnings; multi-target transfer transitions properly; recalling held mark emits `alreadyHeld` warning.
  2. *Resource shortfall overrides:* Expending Prowess when pool is 0 with `overrides: ["shortfall"]` clamps pool at 0 and records `"Prowess short by 1"` on receipts.
  3. *Reaction override:* Using Smokescreen, Blade Shield, or Dangersense with 0 reactions remaining with `overrides: ["reaction"]` succeeds, clamps reaction at 0, and records warning. Simultaneous 0 Prowess & 0 Reaction requires both overrides.
  4. *Preysense Bleeding condition:* Applied on critical hit to living Humanoids and Beasts; strictly NOT applied to Constructs or Undead per Chapter 1 L226; NOT applied on non-critical hits or by characters below Level 11.
  5. *Mortal Blow:* Requires Level 20 Hunter, Martial DC DEX save, interactive 10d8 roll button via `useRoll`, double HP loss on Bleeding targets, and supports `bypassDRResist` vs `bypassAll` readings.
  6. *Trigger limits:* 1/turn limit on marked 0 HP drop correctly enforces max 1 gain per turn and resets on `turnStart`; Hunter >= 30 single attack damage grants 1 Prowess.
  7. *Undo reversibility:* All 6 plans (`transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, `bladeShield`) cleanly reverse resources, reactions, and flags, and repeated undos are idempotent (`already: true`).

- **Static Validation:**
  - `node ak5e/tools/validate-files.mjs`: Validated module.json, lang/en.json, and 270 .mjs files (Clean PASS).
  - `node ak5e/tools/verify-generated-content.mjs`: Verified all generated Chapter 1–6 records (Clean PASS).

---

## 2. Logic Chain

1. **Defect 1 Reasoning (Sweeper Mark Transfer Lockout):**
   - In `AK5e` rules, Sweeper allows an Executor to attack multiple creatures in reach during a single Action.
   - The rule explicitly mandates: *"If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature."*
   - In `executor-features.mjs` lines 366 and 392, mark transfer is strictly guarded by `if (dm.holder === "self" && targetUuid)`.
   - When Target 1 is hit, Deathmark moves to Target 1 (`dm.holder = "target"`).
   - When Target 2 is subsequently attacked or hit in the same Sweeper action, `dm.holder === "self"` evaluates to `false`.
   - Consequently, neither `onAk5eEvent("attack")` nor `onAk5eEvent("hit")` transfers the mark to Target 2. Deathmark remains locked on Target 1 throughout the remainder of Sweeper.
   - Furthermore, `turnEnd` is the only trigger recalling Deathmark for Sweeper (line 513), meaning Deathmark fails to return to the Executor at the conclusion of the Sweeper Action if subsequent actions occur in the same turn.

2. **Defect 2 Reasoning (Collection vs Entry Array Iteration):**
   - In Foundry VTT, `game.actors` is a `WorldCollection` extending `Map`. In standard JavaScript ES6, `Array.from(map)` converts a Map to an array of `[key, value]` entries (i.e. `[[id, actorDocument], ...]`).
   - In `executor-features.mjs` line 447 and line 524, the code executes:
     `const candidates = Array.from(globalThis.game?.actors ?? []);`
     `for (const actor of candidates) { if (!isExecutor(actor)) continue; ... }`
   - Because `actor` is an array tuple `[id, actorDocument]`, calling `isExecutor(actor)` inspects `actor.flags` and `actor.items`, which are undefined on an array.
   - `isExecutor` returns `false` for every actor in the world collection.
   - In worker test `ak5e/test/executor.test.mjs` line 491, the worker masked this defect by manually overriding `globalThis.game.actors = [bodyguard, ally];` with a plain JS array, and in line 456 by passing `raw: { actor: hunter }` (which bypassed `candidates` via line 448).
   - In any realistic Foundry game scenario (or standard fixture execution):
     a) When an NPC or monster drops to 0 HP via damage or combat tracker, `raw.actor` is either the target or null; the Executor in `game.actors` is never found, Deathmark is not recalled, and Prowess is not awarded.
     b) Bodyguard's protected ally 0-damage trigger on `turnEnd` is completely dead and never awards Prowess.
   - Fix requirement: Iteration must access document instances via `globalThis.game?.actors?.values?.() ?? globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? []` and handle both Collection instances and plain Arrays.

---

## 3. Caveats

- Tests were run in Node.js test environment using standard `base-classes-fixture.mjs` without an active Foundry V13 headless browser instance.
- Static file verification (`validate-files.mjs` and `verify-generated-content.mjs`) passed with zero errors.
- No production files were modified by the challenger in accordance with the review-only role constraint.

---

## 4. Conclusion

The Executor subclass implementation has strong baseline mechanics, robust undo receipts, accurate DC calculations, and verified Bleeding exemptions. However, adversarial stress testing uncovered two critical defects that break core gameplay capabilities:
1. **Sweeper Multi-Target Mark Transfer Bug:** Sweeper fails to transfer Deathmark to subsequent hit targets because mark transfer requires `dm.holder === "self"`.
2. **`game.actors` Collection Traversal Bug:** `Array.from(game.actors)` iterates `[id, doc]` tuples instead of documents, breaking automated 0-HP mark recall and Bodyguard ally 0-damage Prowess generation.

**Verdict: REQUEST_CHANGES.** The worker must resolve these two defects in `ak5e/scripts/executor-features.mjs` and verify that all 11 tests in `ak5e/test/executor-adversarial.test.mjs` pass.

---

## 5. Verification Method

To reproduce and verify these findings, run:

```bash
# Run the adversarial stress test suite
node --test ak5e/test/executor-adversarial.test.mjs
```

**Invalidation conditions:**
- `Adversarial 4` passes when Sweeper transfers Deathmark to Target 2 and Target 3 upon hit even when already on another creature, and returns at action end.
- `Adversarial 7.3` and `Adversarial 7.4` pass when `globalThis.game.actors` (as a Map/Collection) is properly traversed by values, enabling 0-HP recall and Bodyguard ally prowess triggers.
