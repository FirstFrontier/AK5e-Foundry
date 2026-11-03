# Review Report — Milestone 4: Specialist Base Class Implementation

**Reviewer:** `reviewer_m4_2`  
**Milestone:** Milestone 4 (Specialist Base Character Class)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2/`  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

Milestone 4 (Specialist Base Character Class) has undergone an independent, high-reliability adversarial review. The implementation demonstrates high integrity (no hardcoded test shortcuts, facades, or bypassed tasks) and sound core foundations for hit point formulas, DCs, feature unlocks, setup idempotency, starting equipment tracking across level-ups, and cash allocation (1,300 CP).

However, **REQUEST_CHANGES** is issued due to:
1. **Critical functional bug in table-play reaction checks (`specialist-uses.mjs`)**: Reaction checks inspect `reactions.value < 1` instead of `!reactions?.available`. Because `getReactions()` returns `{ available: Number, ... }`, `reactions.value` is always `undefined`, causing `undefined < 1` to evaluate to `false`. As a result, spent reactions are never warned against during `itsAllSkill` or `defensiveStyle`, violating WORKFLOW §3.2.
2. **Major schema validation loophole (`specialist-progression.mjs`)**: `previewSpecialistProgression` validates `fightingStyle` against `ALL_FIGHTING_STYLES` instead of verifying that the style belongs to the chosen `weaponCategory` (`MELEE_FIGHTING_STYLES` vs `RANGED_FIGHTING_STYLES`), permitting invalid characters (e.g. Melee Specialist with Ranger fighting style).
3. **Failing project test suites (`npm run test:specialist` and `npm test`)**: Four tests in `ak5e/test/specialist-adversarial.test.mjs` are failing, blocking clean repository builds.

---

## Findings

### [Critical] Finding 1: Reaction budget check uses non-existent `.value` property, suppressing reaction warnings

- **What**: In `ak5e/scripts/specialist-uses.mjs`, reaction exhaustion checks inspect `reactions.value < 1` instead of `!reactions?.available`.
- **Where**: `ak5e/scripts/specialist-uses.mjs`, lines 170 (`itsAllSkill`) and 238 (`defensiveStyle`).
- **Why**: `getReactions(actor)` from `ak5e/scripts/trigger-events.mjs` returns `{ max, spent, triggers, receipts, extra, available }`. It does not provide a `.value` property. In JavaScript, `undefined < 1` evaluates to `false`. Consequently, when an actor has 0 available reactions, the check never triggers, and no `"reaction"` warning is emitted. A player or GM is therefore never warned that their reaction was already spent, allowing reaction-cost abilities to execute silently without presenting the required non-blocking warning and confirmation override dialog, in direct violation of WORKFLOW §3.2 table-play philosophy.
- **Suggestion**: Update lines 170 and 238 in `ak5e/scripts/specialist-uses.mjs` to match the established pattern in `supporter-uses.mjs:162`:
  ```javascript
  const reactions = getReactions(actor);
  if (!reactions?.available) {
    warn(warnings, "reaction", "Reaction already expended this round.");
  }
  ```

---

### [Major] Finding 2: Weapon category and fighting style cross-validation missing in progression preview

- **What**: `previewSpecialistProgression` validates `fightingStyle` against `ALL_FIGHTING_STYLES` rather than the specific category corresponding to `choices.weaponCategory`.
- **Where**: `ak5e/scripts/specialist-progression.mjs`, lines 447–451:
  ```javascript
  const style = choices.fightingStyle;
  const styleObj = ALL_FIGHTING_STYLES.find(s => s.id === style);
  if (!style || !styleObj) {
    pending.push("fightingStyle");
  }
  ```
- **Why**: AK5e Chapter 3 rules (L5190–5200) explicitly require that a Melee Combat specialist choose from the Melee Fighting Style table (`MELEE_FIGHTING_STYLES`), and a Ranged Combat specialist choose from the Ranged Fighting Style table (`RANGED_FIGHTING_STYLES`). While `inspectSpecialistFields` correctly presents filtered options in the UI, `previewSpecialistProgression` accepts a Melee category with a Ranged style (e.g. `weaponCategory: "melee"` and `fightingStyle: "ranger"`). This produces an illegal progression state where the actor receives Melee Specialisation benefits (`weaponExpertiseMelee` and `weaponMasteryMelee`) while holding an unauthorized ranged fighting style.
- **Suggestion**: Validate `style` against the matching category array in `previewSpecialistProgression`:
  ```javascript
  const categoryStyles = weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : MELEE_FIGHTING_STYLES;
  const styleObj = categoryStyles.find(s => s.id === style);
  if (!style || !styleObj) {
    pending.push("fightingStyle");
  }
  ```

---

### [Major] Finding 3: Failing test suites in `specialist-adversarial.test.mjs` block `npm run test:specialist` and `npm test`

- **What**: `npm run test:specialist` and `npm test` fail with exit code 1.
- **Where**: `ak5e/test/specialist-adversarial.test.mjs`:
  - `ADV-FU-4: Reaction already spent triggers reaction warning` (line 286)
  - `ADV-WEAP-5: Defensive Fighting Style reaction consumption and undo` (line 423)
  - `ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo` (line 444)
  - `ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration` (line 463)
- **Why**:
  1. `ADV-FU-4` fails because of Finding 1 in `specialist-uses.mjs`, and because line 292 asserts `assert.equal(getReactions(actor).value, 0)` (property is `.available`).
  2. `ADV-WEAP-5` (line 425) and `ADV-UNDO-2` (line 467) assert `assert.equal(getReactions(actor).value, 1)` (property is `.available`).
  3. `ADV-UNDO-1` (line 455) asserts `assert.equal(receipt.status, "applied")`. In `play-uses.mjs:300`, completed operations set `receipt.status = "complete"`.
- **Suggestion**: Alongside resolving Finding 1 in `specialist-uses.mjs`, align the assertions in `specialist-adversarial.test.mjs` to check `getReactions(actor).available` and `receipt.status === "complete"`.

---

## 1. Observation

### 1.1 Direct Observations & Test Outputs
1. **Source Code Inspection**:
   - `ak5e/scripts/specialist-uses.mjs`: Line 170 and Line 238 state `if (reactions.value < 1)`.
   - `ak5e/scripts/trigger-events.mjs`: Line 484 defines `get` as `return { ...state, available: Math.max(0, state.max - state.spent) + ... }`. It does not contain `value`.
   - `ak5e/scripts/specialist-progression.mjs`: Line 448 verifies `ALL_FIGHTING_STYLES.find(s => s.id === style)`.
   - `ak5e/scripts/play-uses.mjs`: Line 300 sets `receipt.status = ... ? "awaitingRoll" : "complete"`.
2. **Command Executions**:
   - `npm run test:specialist`:
     ```text
     ✖ ADV-FU-4: Reaction already spent triggers reaction warning (1.009454ms)
     ✖ ADV-WEAP-5: Defensive Fighting Style reaction consumption and undo (0.387429ms)
     ✖ ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo (0.717538ms)
     ✖ ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration (0.401255ms)
     ℹ tests 45
     ℹ suites 0
     ℹ pass 41
     ℹ fail 4
     ```
     Exit code: 1.
   - `node ak5e/tools/validate-files.mjs`:
     ```text
     Validated module.json, lang/en.json, and 249 .mjs files.
     Exit code: 0
     ```
   - `npm run test:base-classes`:
     ```text
     Vanguard: 74 pass, 0 fail
     Supporter: 44 pass, 0 fail
     Specialist: 41 pass, 4 fail
     Exit code: 1
     ```
   - `npm test`:
     Exited with code 1 due to Specialist suite failure.

---

## 2. Logic Chain

1. **Integrity Check**:
   - Examined `specialist-rules.mjs`, `specialist-features.mjs`, `specialist-setup.mjs`, `specialist-progression.mjs`, and `specialist-uses.mjs`.
   - Confirmed 0 hardcoded test results, 0 mock actor facades, 0 tautological test assertions, and 0 fabricated logs. Real implementations exist throughout.
2. **Rules Fidelity & Progression Invariants**:
   - Hit dice (1d8), base HP (8+CON), level HP (5+CON / 1d8+CON), DCs (`specialistDC`: 8+PB+DEX, `martialDC`: 8+PB+max(STR,DEX)) are dynamically computed.
   - Level 1–20 level steps and feature gates match Chapter 3 (Show Your Style Lv 4, Weapon Adept Lv 6, Weapon Expertise Lv 12, Falling Upwards Lv 17, Weapon Mastery Lv 18).
   - Progression idempotency is well-engineered: deterministic `contextKey` hashes prevent applying mismatched preview plans; `state.startingEquipmentGranted` guarantees that starting equipment items and the 1,300 CP cash option (`writes["system.currency.cp"] = beforeCp + 1300`) are granted strictly once and never duplicated across level-ups.
3. **Reaction Tracking Defect Trace**:
   - `itsAllSkill` and `defensiveStyle` rely on `getReactions(actor)` to verify reaction availability.
   - Calling `getReactions(actor)` returns `{ spent: 0, max: 1, extra: [], available: 1, ... }`.
   - When reaction is spent, `available` drops to 0.
   - However, the code checks `reactions.value < 1`. In JavaScript, accessing non-existent property `.value` yields `undefined`.
   - `undefined < 1` evaluates to `false`.
   - Therefore, the check condition never triggers, and `warn(warnings, "reaction", ...)` is never called.
   - This failure was reproduced empirically in `/tmp/stress-specialist.mjs` line 185: when reaction was spent, `itsAllSkill` completed without raising a reaction warning.
4. **Fighting Style Cross-Validation Defect Trace**:
   - A character initialized with `weaponCategory: "melee"` and `fightingStyle: "ranger"` passes preview without pending warnings (`plan.valid === true`).
   - Chapter 3 explicitly restricts melee fighting styles to melee combat, and ranged styles to ranged combat.
   - Cross-validation between `choices.weaponCategory` and `choices.fightingStyle` is missing in `previewSpecialistProgression`.

---

## 3. Caveats

- Individual Specialist subclass mechanics (Executor, Hookmaster, Infuser, Inventor, Skyranger, Dollkeeper, Trapmaster) are deferred to subclass milestones per `PROJECT.md`; base class setup correctly handles branch subclass item attachment.
- The 4 failing tests in `ak5e/test/specialist-adversarial.test.mjs` stem from a combination of the genuine `specialist-uses.mjs` reaction bug and inaccurate property/status assertions in the adversarial test file itself. Both must be corrected to achieve green test gates.
- No other caveats.

---

## 4. Conclusion

Milestone 4 (Specialist Base Character Class) cannot be approved until Findings 1, 2, and 3 are remediated. The core architecture is sound, but the reaction checking defect compromises WORKFLOW §3.2 player agency/warning requirements, and the test suite currently fails regression checks.

**Verdict**: **REQUEST_CHANGES**

---

## 5. Verification Method

To independently verify the findings and confirm fixes:

1. **Verify Reaction Defect**:
   ```bash
   node -e '
   import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
     setupFoundryGlobals();
     const { specialistUses } = await import("./ak5e/scripts/specialist-uses.mjs");
     const { spendReaction, getReactions } = await import("./ak5e/scripts/trigger-events.mjs");
     const { refundPool, defineSpecialistPools } = await import("./ak5e/scripts/resource-pools.mjs");
     const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
     defineSpecialistPools();
     const actor = createTestActor({
       items: [createTestItem({ name: "Specialist", type: "class", system: { levels: 17 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } })],
       flags: { ak5e: { specialist: { enabled: true } } }
     });
     await refundPool(actor, "prowess", 6);
     await spendReaction(actor, { triggerId: "prior-reaction" });
     const reactions = getReactions(actor);
     console.log("Reactions available:", reactions.available, "value:", reactions.value);
     const plan = specialistUses.plan(actor, "itsAllSkill", {});
     console.log("Warnings emitted when reaction spent:", plan.warnings);
   });
   '
   ```
   *Expected behavior after fix:* `plan.warnings` must include `{ id: "reaction", ... }`.
   *Current behavior:* `plan.warnings` is empty (`[]`).

2. **Verify Fighting Style Mismatch**:
   ```bash
   node -e '
   import("./ak5e/test/base-classes-fixture.mjs").then(async ({ setupFoundryGlobals, createTestActor, createTestItem }) => {
     setupFoundryGlobals();
     const { previewSpecialistProgression } = await import("./ak5e/scripts/specialist-progression.mjs");
     const { SPECIALIST_CLASS_ID } = await import("./ak5e/scripts/specialist-rules.mjs");
     const actor = createTestActor({
       items: [createTestItem({ name: "Specialist", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } })]
     });
     const plan = await previewSpecialistProgression(actor, {
       branch: "subclass-specialist-executor",
       saves: ["wis"],
       skills: ["acr", "slt", "ste"],
       weaponCategory: "melee",
       fightingStyle: "ranger", // Mismatched style!
       startingEquipment: { mode: "cash" },
       hp: { 1: { mode: "fixed" } }
     });
     console.log("Plan valid with mismatched style?", plan.valid, "Pending:", plan.pending);
   });
   '
   ```
   *Expected behavior after fix:* `plan.valid` is `false`, and `plan.pending` includes `"fightingStyle"`.
   *Current behavior:* `plan.valid` is `true`.

3. **Verify Test Suites**:
   ```bash
   npm run test:specialist
   node ak5e/tools/validate-files.mjs
   npm run test:base-classes
   npm test
   ```
   *Pass criteria:* All suites exit 0 with 100% passing tests.
