# Handoff Report — Milestone 4: Specialist Base Class Quality Review

**Agent:** `reviewer_m4_1`  
**Milestone:** M4 (Specialist Base Character Class)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1/`  
**Verdict:** **REQUEST_CHANGES**

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

The Specialist base class implementation demonstrates strong foundational adherence to AK5e Chapter 3 mechanics across Hit Dice, HP formulas, saving throw and skill options, 15 Weapon Specialisation styles, and idempotent progression. However, **REQUEST_CHANGES** is required due to three significant issues:
1. **Critical Defect (WORKFLOW §3.2 Table Play Violation)**: `specialist-uses.mjs` checks `reactions.value < 1` instead of `reactions.available < 1`. Because `getReactions(actor)` returns `{ available: ... }` without a `.value` property, `reactions.value` is always `undefined`, causing reaction exhaustion checks to evaluate to `false`. Specialist reaction abilities (`itsAllSkill` and `defensiveStyle`) completely fail to warn when reactions are already exhausted.
2. **Critical Quality Gate Failure (`npm test` Exits 1)**: The overall test suite fails due to 4 test failures in `ak5e/test/specialist-adversarial.test.mjs`, breaking repository CI/test gates.
3. **Major Rules Fidelity Violation (Double Rest Recovery)**: `specialist-features.mjs` registers a duplicate `dnd5e.restCompleted` hook that invokes `recoverPool(actor, trigger)`. Because `resource-pools.mjs` already registers `dnd5e.restCompleted` and handles `recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]`, in live play with core hooks active, Specialists regain 2 Prowess per Short and Long Rest instead of 1 Prowess (violating Chapter 3 L5315).

---

## 1. Observation

### 1.1 Verbatim Code Observations
1. **Reaction Property Check Bug in `specialist-uses.mjs`**:
   - `ak5e/scripts/specialist-uses.mjs` lines 169–173:
     ```javascript
     const reactions = getReactions(actor);
     if (reactions.value < 1) {
       warn(warnings, "reaction", "Reaction already expended this round.");
     }
     ```
   - `ak5e/scripts/specialist-uses.mjs` lines 237–241:
     ```javascript
     const reactions = getReactions(actor);
     if (reactions.value < 1) {
       warn(warnings, "reaction", "Reaction already expended this round.");
     }
     ```
   - Contrast with `ak5e/scripts/trigger-events.mjs` lines 482–486:
     ```javascript
     const get = actor => {
       const state = normalizeReactions(store.read(actor));
       return { ...state, available: Math.max(0, state.max - state.spent) +
         state.extra.reduce((sum, e) => sum + Math.max(0, e.count - e.spent), 0) };
     };
     ```
     `getReactions(actor)` provides `.available`, `.max`, `.spent`, `.extra`, `.triggers`, and `.receipts`. It has NO `.value` property.
   - Contrast with sibling modules `vanguard-uses.mjs` line 261 (`if (reactions?.available < 1)`) and `supporter-uses.mjs` line 162 (`if (!reactions?.available)`).
   - In JavaScript, `undefined < 1` evaluates to `false`. Consequently, `warn(warnings, "reaction", ...)` is never invoked.

2. **Duplicate Rest Recovery Hook in `specialist-features.mjs`**:
   - `ak5e/scripts/specialist-features.mjs` lines 52–68 registers `prowess` with canonical recovery rules:
     ```javascript
     recovery: [
       { on: "lr", amount: 1 },
       { on: "sr", amount: 1 }
     ]
     ```
   - `ak5e/scripts/resource-pools.mjs` line 462 automatically attaches `Hooks.on("dnd5e.restCompleted", onRestCompleted)`, which calls `recoverPool(actor, triggers)`.
   - `ak5e/scripts/specialist-features.mjs` lines 81–86 registers an extra hook:
     ```javascript
     if (typeof globalThis.Hooks?.on === "function") {
       globalThis.Hooks.on("dnd5e.restCompleted", async (actor, result, config = {}) => {
         const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
         await onSpecialistRest(actor, type);
       });
     }
     ```
   - When both core and specialist hooks are active, a single rest executes:
     `Initial prowess: 0 -> Prowess after 1 short rest with both hooks: 2`.
     This violates Chapter 3 L5315: *"You gain 1 Prowess whenever you complete a Short or Long Rest."*

3. **Verbatim Test Failure Output from `npm test`**:
   Command: `npm test`  
   Exit code: 1  
   Verbatim output:
   ```text
   ✖ failing tests:

   test at ak5e/test/specialist-adversarial.test.mjs:286:1
   ✖ ADV-FU-4: Reaction already spent triggers reaction warning (1.030334ms)
     AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
     
     undefined !== 0
     
         at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/specialist-adversarial.test.mjs:292:10)

   test at ak5e/test/specialist-adversarial.test.mjs:423:1
   ✖ ADV-WEAP-5: Defensive Fighting Style reaction consumption and undo (0.390124ms)
     AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
     
     undefined !== 1
     
         at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/specialist-adversarial.test.mjs:425:10)

   test at ak5e/test/specialist-adversarial.test.mjs:444:1
   ✖ ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo (0.698842ms)
     AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
     + actual - expected
     
     + 'complete'
     - 'applied'
     
         at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/specialist-adversarial.test.mjs:455:10)

   test at ak5e/test/specialist-adversarial.test.mjs:463:1
   ✖ ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration (0.396977ms)
     AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
     
     undefined !== 1
     
         at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/specialist-adversarial.test.mjs:467:10)
   ```

---

## 2. Logic Chain

1. **Table-Play Philosophy (WORKFLOW §3.2)**:
   - WORKFLOW §3.2 mandates: *"Warn but never block on range or prerequisites. Always confirm before a use (ability checks and saves excepted)."*
   - Active abilities consuming reactions (`itsAllSkill` and `defensiveStyle`) must detect when the character's reaction budget is already 0, and emit a non-blocking warning (`warn(warnings, "reaction", ...)`).
   - In `specialist-uses.mjs`, querying `reactions.value` yields `undefined`.
   - Since `undefined < 1` is false in JS, no warning is emitted.
   - An actor with 0 reactions can use `itsAllSkill` and `defensiveStyle` without a reaction warning, violating WORKFLOW §3.2.
2. **Rules Fidelity (AK5e Chapter 3 L5315)**:
   - Chapter 3 states: *"You gain 1 Prowess whenever you complete a Short or Long Rest."*
   - Because `resource-pools.mjs` handles pool recovery automatically from the pool definition `{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }`, the second hook in `specialist-features.mjs` triggers a second recovery.
   - Runtime execution confirms that 2 Prowess is gained instead of 1 Prowess.
3. **Repository Quality Gates & Integrity**:
   - `worker_m4/handoff.md` reported `npm test` passing with 0 failures based on tests authored in `specialist-*.test.mjs`.
   - The test authored by `worker_m4` (`specialistUses: itsAllSkill auto-success spend, reaction consumption, and undo`) only asserted that `receipt.reaction?.spent === true`; it never verified that attempting to use the ability when reactions are 0 yields a warning.
   - Running the full regression suite `npm test` now executes `ak5e/test/specialist-adversarial.test.mjs`, failing 4 tests and exiting with code 1.
   - Under standard quality gates, code changes cannot be approved when `npm test` fails.

---

## 3. Findings

### [Critical] Finding 1: Reaction Depletion Warning Bypassed in `specialist-uses.mjs`
- **What**: `specialist-uses.mjs` accesses `reactions.value` instead of `reactions.available`.
- **Where**: `ak5e/scripts/specialist-uses.mjs:169` and `ak5e/scripts/specialist-uses.mjs:237`.
- **Why**: `getReactions(actor)` returns `{ ...state, available: ... }`. Because `reactions.value` is `undefined`, the check `reactions.value < 1` is never true. Players are never warned when their reaction is already expended before using `itsAllSkill` or `defensiveStyle`, breaking WORKFLOW §3.2 table play contract.
- **Suggestion**: Replace `reactions.value < 1` with `reactions?.available < 1` (or `!reactions?.available`) in both locations.

### [Critical] Finding 2: `npm test` Fails with Exit Code 1
- **What**: The repository-wide test command `npm test` exits with code 1 due to 4 test failures in `ak5e/test/specialist-adversarial.test.mjs`.
- **Where**: `ak5e/test/specialist-adversarial.test.mjs` lines 292, 425, 455, 467.
- **Why**: Two reasons:
  1. `specialist-uses.mjs` does not emit the expected reaction warning (Finding 1).
  2. The adversarial test itself checks `getReactions(actor).value` instead of `getReactions(actor).available`, and asserts `receipt.status === "applied"` instead of `"complete"`.
- **Suggestion**:
  1. Fix `reactions?.available` in `specialist-uses.mjs`.
  2. Reconcile `specialist-adversarial.test.mjs` lines 292, 425, 467 to check `.available`, and line 455 to assert `receipt.status === "complete"`.

### [Major] Finding 3: Duplicate Rest Hook Causes Double Prowess Recovery
- **What**: `specialist-features.mjs` registers an extra `dnd5e.restCompleted` hook that recovers Prowess, duplicating the recovery already performed by `resource-pools.mjs`.
- **Where**: `ak5e/scripts/specialist-features.mjs:81–86`.
- **Why**: Chapter 3 L5315 limits recovery to 1 Prowess per Short or Long Rest. With both core and specialist hooks active, an actor regains 2 Prowess per rest.
- **Suggestion**: Remove the redundant `dnd5e.restCompleted` hook registration from `specialist-features.mjs`, allowing `resource-pools.mjs` to manage rest recovery canonically.

---

## 4. Verified Claims

- **Hit Dice & HP Formulas**: Hit dice 1d8, 8+CON base HP, 5+CON fixed or 1d8+CON rolled for levels 2–20 (Ch. 3 L5178–5181). Verified via `hitPointsAtLevel()` unit tests. [PASS]
- **Saving Throw Options**: Dexterity automatic + exactly 1 chosen from Wisdom or Charisma (Ch. 3 L5187). Verified via `specialist-progression.mjs` validation. [PASS]
- **Skills**: Exactly 3 chosen from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness (Ch. 3 L5188). Verified via strict permutation rejection tests. [PASS]
- **15 Fighting Styles Catalog**: 8 Melee and 7 Ranged fighting styles correctly mapped to chapter-three compendium entries with exact IDs (Ch. 3 L5244–5299). [PASS]
- **Prowess Pool Definition**: Max `@prof`, initial 0, recovered on Short and Long Rest (Ch. 3 L5312–5316). [PASS]
- **Mark of a Specialist**: Spend 1 Prowess on reroll; refund 1 Prowess if second check fails. Verified in `specialist-uses.mjs`. [PASS]
- **Progression Unlocks**: Weapon Adept (Lv 6), Weapon Expertise (Lv 12), Falling Upwards (Lv 17), Weapon Mastery (Lv 18). Verified in `specialist-features.mjs`. [PASS]
- **Setup & Progression Idempotency**: Running setup or progression multiple times preserves existing items, hit points, and prevents duplicate starting gear or currency. [PASS]
- **Static File Validation**: `node ak5e/tools/validate-files.mjs` validates 249 `.mjs` files with exit code 0. [PASS]

---

## 5. Coverage Gaps

- **Headless Live Browser Testing (ActorSheetV2 Rendering)**: Live browser validation with screenshots is scheduled for Milestone 7 (planned). Risk is acceptable for Milestone 4 unit scope, provided unit and regression tests pass cleanly.

---

## 6. Caveats

- As a reviewer and adversarial critic, I do not directly modify implementation or test files. The required corrections must be implemented by the worker agent (`worker_m4`) or designated fixer.
- `specialist-adversarial.test.mjs` was introduced concurrently by a peer challenger agent. Both the production code bugs (`specialist-uses.mjs` and `specialist-features.mjs`) and the test expectations in `specialist-adversarial.test.mjs` must be addressed to achieve a clean `npm test` run.

---

## 7. Conclusion

Milestone 4 (Specialist Base Character Class) cannot be approved in its current state.
The verdict is **REQUEST_CHANGES**.

Before Milestone 4 can be approved:
1. `specialist-uses.mjs` must be corrected to check `reactions?.available < 1` in `itsAllSkill` and `defensiveStyle`.
2. `specialist-features.mjs` must be corrected to prevent double rest recovery of Prowess.
3. `specialist-adversarial.test.mjs` assertions must be reconciled so that `npm test` runs with 100% passes and 0 failures.

---

## 8. Verification Method

To independently verify the implementation after remedies are applied:

1. **Verify Reaction Warning Behavior**:
   ```bash
   node -e '
   Promise.all([
     import("./ak5e/test/base-classes-fixture.mjs"),
     import("./ak5e/scripts/trigger-events.mjs"),
     import("./ak5e/scripts/specialist-uses.mjs"),
     import("./ak5e/scripts/specialist-features.mjs")
   ]).then(async ([fixture, triggers, uses, feats]) => {
     fixture.setupFoundryGlobals();
     feats.defineSpecialistPools();
     const actor = fixture.createTestActor({
       items: [fixture.createTestItem({ name: "Specialist", type: "class", system: { levels: 17 }, flags: { ak5e: { chapterThreeId: "class-specialist" } } })],
       flags: { ak5e: { specialist: { enabled: true } } }
     });
     await triggers.spendReaction(actor, { triggerId: "previous" });
     const plan = uses.specialistUses.plan(actor, "itsAllSkill", { overrides: ["shortfall"] });
     console.log("Reaction warning present:", plan.warnings.some(w => w.id === "reaction"));
   });'
   ```
   *Expected result*: `Reaction warning present: true`.

2. **Verify Rest Recovery Hook**:
   ```bash
   node -e '
   Promise.all([
     import("./ak5e/test/base-classes-fixture.mjs"),
     import("./ak5e/scripts/resource-pools.mjs"),
     import("./ak5e/scripts/specialist-features.mjs")
   ]).then(async ([fixture, pools, spec]) => {
     fixture.setupFoundryGlobals();
     pools.registerResourcePoolHooks();
     spec.registerSpecialistHooks();
     const actor = fixture.createTestActor({
       items: [fixture.createTestItem({ name: "Specialist", type: "class", system: { levels: 6 }, flags: { ak5e: { chapterThreeId: "class-specialist" } } })],
       flags: { ak5e: { specialist: { enabled: true } } }
     });
     await fixture.triggerShortRest(actor);
     console.log("Prowess after rest:", pools.getPool(actor, "prowess").value);
   });'
   ```
   *Expected result*: `Prowess after rest: 1` (NOT 2).

3. **Verify Specialist Test Suite**:
   ```bash
   npm run test:specialist
   ```
   *Expected result*: All specialist tests pass with 0 failures.

4. **Verify Full Regression Test Suite**:
   ```bash
   npm test
   ```
   *Expected result*: Exit code 0 across all test suites.
