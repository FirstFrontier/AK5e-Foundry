# Handoff Report — Milestone 4: Specialist Base Class Adversarial Verification

**Agent:** `challenger_m4_1`  
**Milestone:** M4 (Specialist Base Character Class)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_1/`  
**Verdict:** **REQUEST_CHANGES**

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

Empirical stress testing of the Milestone 4 Specialist base class implementation revealed **two high-severity defects** that break core table-play philosophy (WORKFLOW §3.2) and rules authority (Chapter 3 L5315).

1. **Defect 1 (WORKFLOW §3.2 Violation): Missing Reaction Warning in `itsAllSkill` and `defensiveStyle`**
   - In `ak5e/scripts/specialist-uses.mjs:170` and `ak5e/scripts/specialist-uses.mjs:238`, reaction availability is checked via `if (reactions.value < 1)`.
   - `getReactions(actor)` from `trigger-events.mjs` returns `{ max, spent, extra, triggers, receipts, available }` and does **not** provide a `.value` property.
   - `reactions.value` evaluates to `undefined`, and `undefined < 1` evaluates to `false`.
   - As an empirical consequence, when an actor has already expended their reaction in a round (`available: 0`), **no warning is emitted**. The action plan proceeds with 0 warnings, bypassing the required table-play confirmation warning dialog.

2. **Defect 2 (Rules Authority Violation): Redundant `dnd5e.restCompleted` Hook Causing Double Prowess Recovery (+2 Instead of +1)**
   - In `ak5e/scripts/specialist-features.mjs:82–86`, `registerSpecialistHooks()` registers an additional `dnd5e.restCompleted` listener that invokes `onSpecialistRest(actor, type)`.
   - The `prowess` pool definition in `defineSpecialistPools()` (`specialist-features.mjs:62–65`) already configures native recovery: `recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]`.
   - In live Foundry play, `ResourcePools.registerResourcePoolHooks()` (invoked at `ak5e.mjs:372`) already listens to `dnd5e.restCompleted` and executes `recoverPool(actor, triggers)` for all registered pools.
   - With both listeners active, completing a short or long rest recovers **2 Prowess instead of 1**, directly violating Chapter 3 L5315 ("You gain 1 Prowess whenever you complete a Short or Long Rest").

---

## 1. Observation

### 1.1 Direct Code Observations

1. **`ak5e/scripts/specialist-uses.mjs:169–173`:**
   ```javascript
   169:     const reactions = getReactions(actor);
   170:     if (reactions.value < 1) {
   171:       warn(warnings, "reaction", "Reaction already expended this round.");
   172:     }
   ```
2. **`ak5e/scripts/specialist-uses.mjs:237–241`:**
   ```javascript
   237:     const reactions = getReactions(actor);
   238:     if (reactions.value < 1) {
   239:       warn(warnings, "reaction", "Reaction already expended this round.");
   240:     }
   ```
3. **`ak5e/scripts/trigger-events.mjs:482–486`:**
   ```javascript
   482:   const get = actor => {
   483:     const state = normalizeReactions(store.read(actor));
   484:     return { ...state, available: Math.max(0, state.max - state.spent) +
   485:       state.extra.reduce((sum, e) => sum + Math.max(0, e.count - e.spent), 0) };
   486:   };
   ```
   *Note: `getReactions(actor)` returns an object with keys `{ max, spent, extra, triggers, receipts, available }`. It has no `.value` property.*

4. **`ak5e/scripts/specialist-features.mjs:54–66` & `76–87`:**
   ```javascript
   54:     definePool({
   55:       id: "prowess",
   56:       label: "Prowess",
   57:       max: "@prof",
   58:       initial: 0,
   59:       classId: "class-specialist",
   60:       levelBasis: "classLevel",
   61:       appliesTo: actor => specialistEnabled(actor) && ((specialistLevel(actor) ?? 1) >= 4 || Boolean(flag(actor, "specialist")?.prowessEarlyUnlocked)),
   62:       recovery: [
   63:         { on: "lr", amount: 1 },
   64:         { on: "sr", amount: 1 }
   65:       ]
   66:     });
   ...
   76: export function registerSpecialistHooks() {
   77:   if (hooksInstalled) return;
   78:   hooksInstalled = true;
   79:   defineSpecialistPools();
   80: 
   81:   if (typeof globalThis.Hooks?.on === "function") {
   82:     globalThis.Hooks.on("dnd5e.restCompleted", async (actor, result, config = {}) => {
   83:       const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
   84:       await onSpecialistRest(actor, type);
   85:     });
   86:   }
   87: }
   ```

5. **`ak5e/scripts/ak5e.mjs:372`:**
   ```javascript
   372:   ResourcePools.registerResourcePoolHooks();
   ```

### 1.2 Verbatim Test Executions & Empirical Reproductions

1. **Reproduction of Defect 1 (Omitted Reaction Warning):**
   Command:
   ```bash
   node -e '
   import { setupFoundryGlobals, createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
   import { specialistUses } from "./ak5e/scripts/specialist-uses.mjs";
   import { spendReaction, getReactions } from "./ak5e/scripts/trigger-events.mjs";
   import { defineSpecialistPools } from "./ak5e/scripts/specialist-features.mjs";
   setupFoundryGlobals(); defineSpecialistPools();
   const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 17 }, flags: { ak5e: { chapterThreeId: "class-specialist" } } });
   const actor = createTestActor({ items: [sClass], system: { attributes: { prof: 6 } }, flags: { ak5e: { specialist: { enabled: true } } } });
   await spendReaction(actor, { triggerId: "prior" });
   console.log("getReactions:", getReactions(actor));
   const plan = specialistUses.plan(actor, "itsAllSkill", {});
   console.log("plan.warnings:", plan.warnings);
   '
   ```
   Verbatim output:
   ```text
   getReactions: {
     max: 1,
     spent: 1,
     extra: [],
     triggers: { prior: true },
     receipts: {},
     available: 0
   }
   plan.warnings: []
   ```
   *Finding: `plan.warnings` is empty `[]` when `available` is 0.*

2. **Reproduction of Defect 2 (Double Rest Recovery):**
   Command:
   ```bash
   node -e '
   import { setupFoundryGlobals, createTestActor, createTestItem, triggerShortRest } from "./ak5e/test/base-classes-fixture.mjs";
   import { registerSpecialistHooks } from "./ak5e/scripts/specialist-features.mjs";
   import { registerResourcePoolHooks, getPool } from "./ak5e/scripts/resource-pools.mjs";
   setupFoundryGlobals(); registerResourcePoolHooks(); registerSpecialistHooks();
   const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 6 }, flags: { ak5e: { chapterThreeId: "class-specialist" } } });
   const actor = createTestActor({ items: [sClass], system: { attributes: { prof: 3 } }, flags: { ak5e: { specialist: { enabled: true } } } });
   console.log("Before rest:", getPool(actor, "prowess").value);
   await triggerShortRest(actor);
   console.log("After short rest:", getPool(actor, "prowess").value);
   '
   ```
   Verbatim output:
   ```text
   Before rest: 0
   After short rest: 2
   ```
   *Finding: Prowess increased from 0 to 2 on a single short rest.*

3. **Adversarial Test Suite Execution:**
   Command:
   ```bash
   node --test ak5e/test/specialist-adversarial.test.mjs
   ```
   Verbatim output:
   ```text
   ✔ ADV-PROW-1: Prowess pool max scales strictly with Proficiency Bonus across levels 1–20 (5.426114ms)
   ✔ ADV-PROW-2: Initial Prowess value is 0, requiring rest or refund before use (0.575066ms)
   ✔ ADV-PROW-3A: Short Rest restores 1 Prowess and Long Rest restores 1 Prowess (bounded at max) (2.221805ms)
   ✔ ADV-PROW-3B: EMPIRICAL DEFECT DEMONSTRATION — Dual restCompleted listeners cause double recovery in live environment (0.876942ms)
   ✔ ADV-PROW-4: Pre-level 4 actors do not gain Prowess on rests (0.427004ms)
   ✔ ADV-PROW-5: Zero-floor clamping on overspend and shortfall warnings with overrides (2.196377ms)
   ✔ ADV-MOS-1: Spend 1 Prowess on proficient ability check reroll (0.979357ms)
   ✔ ADV-MOS-2: Refund of 1 Prowess if second roll is also a failure (1.211099ms)
   ✔ ADV-MOS-3: Successful second roll results in no refund (Prowess remains spent) (0.821346ms)
   ✔ ADV-MOS-4: Level requirement check (Level < 4 triggers level warning) (0.458073ms)
   ✔ ADV-FU-1: Spend 3 Prowess and 1 reaction to auto-succeed on saving throw (1.3009ms)
   ✔ ADV-FU-2: Level < 17 triggers level warning (0.360477ms)
   ✔ ADV-FU-3: Shortfall behavior when Prowess < 3 (warns and clamps at 0 if overridden) (1.389458ms)
   ✔ ADV-FU-4A: EMPIRICAL DEFECT DEMONSTRATION — Reaction warning omitted due to reactions.value property check in specialist-uses.mjs:170 (0.418808ms)
   ⚠ ADV-FU-4B: [TODO CONTRACT] itsAllSkill should emit reaction warning when reaction is spent (0.773725ms) # Defect in specialist-uses.mjs:170 — checks reactions.value instead of reactions.available
   ✔ ADV-WEAP-1: Level unlock gates for all weapon progression tiers (1.389108ms)
   ✔ ADV-WEAP-2: Weapon Expertise Melee vs Ranged choice enforcement and bonus (1.372326ms)
   ✔ ADV-WEAP-3: Weapon Mastery Melee bonus scales to floor(level / 2) (1.024483ms)
   ✔ ADV-WEAP-4: Weapon Mastery Ranged bonus doubles PB (+PB attack bonus) (0.714893ms)
   ✔ ADV-WEAP-5A: EMPIRICAL DEFECT DEMONSTRATION — Defensive Fighting Style reaction warning omitted due to reactions.value (0.317625ms)
   ✔ ADV-WEAP-5B: Defensive Fighting Style reaction consumption and clean reversible undo (1.024773ms)
   ✔ ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo (0.465728ms)
   ✔ ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration (1.677077ms)
   ✔ ADV-UNDO-3: Undo with shortfall override correctly restores 'before' value, not theoretical cost (0.955081ms)
   ℹ tests 24
   ℹ suites 0
   ℹ pass 23
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 1
   ℹ duration_ms 177.487801
   ```

---

## 2. Logic Chain

1. **WORKFLOW §3.2 Mandate:**
   - WORKFLOW §3.2 requires: "Warn but never block on range or prerequisites. Always confirm before a use."
   - When a feature consumes a Reaction (such as `itsAllSkill` or `defensiveStyle`), the player must be warned prior to execution if their reaction budget for that round is already 0.
2. **Defect 1 Invalidation:**
   - In Observation 1.1 (1 and 2), `specialist-uses.mjs` checks `if (reactions.value < 1)`.
   - In Observation 1.1 (3), `getReactions(actor)` returns `{ max, spent, extra, triggers, receipts, available }`. It has no `.value` property.
   - Therefore, `reactions.value` is `undefined`.
   - In JavaScript, `undefined < 1` evaluates to `false`.
   - In Observation 1.2 (1), when `reactions.available === 0`, `plan.warnings` is empty `[]`.
   - Therefore, the user confirmation dialog will show zero warnings and allow execution without prerequisite notice, directly violating WORKFLOW §3.2.
3. **Rules Authority Adherence (Chapter 3 L5315):**
   - Source rules state: "You gain 1 Prowess whenever you complete a Short or Long Rest."
   - In Observation 1.1 (4), `prowess` is defined with `recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]`.
   - In Observation 1.1 (5), `ResourcePools.registerResourcePoolHooks()` in `ak5e.mjs` automatically handles rest recovery for all registered pools.
   - However, `registerSpecialistHooks()` in `specialist-features.mjs` additionally binds `onSpecialistRest` directly to `dnd5e.restCompleted`.
   - In Observation 1.2 (2), when both hooks fire on `dnd5e.restCompleted`, `recoverPool` is called twice, granting +2 Prowess on a single short rest.
   - This directly violates Chapter 3 L5315.
4. **Adversarial Verification:**
   - 23 other tests in `specialist-adversarial.test.mjs` verify that Prowess pool scaling (2 to 6), Show Your Style rerolls and failure refunds, zero-floor clamping on overspend, Weapon Adept/Expertise/Mastery formulas, and multi-action undo reversibility are solid and robust.
   - The two defects identified above are reproducible, empirical, and isolated.

---

## 3. Stress Test Results Matrix

| Scenario / Test ID | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| **ADV-PROW-1** | Prowess max equals `@prof` (scales 2 to 6 across Lv 1–20) | Max strictly equals PB at all 20 levels | **PASS** |
| **ADV-PROW-2** | Initial Prowess value is 0 on new Specialist | Initial value is 0 | **PASS** |
| **ADV-PROW-3A** | Short & Long rest recover exactly 1 Prowess up to max | Recovers 1 per rest in isolation | **PASS** |
| **ADV-PROW-3B** | Dual restCompleted hook firing preserves 1 Prowess gain | Recovers +2 Prowess (duplicate listener) | **FAIL (DEFECT 2)** |
| **ADV-PROW-4** | Level < 4 Specialist gains no Prowess on rest | Recovers 0 on rest | **PASS** |
| **ADV-PROW-5** | Spending with 0 Prowess warns shortfall; override clamps at 0 | Clamps at 0, receipt records shortfall | **PASS** |
| **ADV-MOS-1** | Mark of a Specialist spends 1 Prowess on check reroll | Spends 1 Prowess, records refundable=true | **PASS** |
| **ADV-MOS-2** | Second failure refunds 1 Prowess | 1 Prowess restored to pool | **PASS** |
| **ADV-MOS-3** | Second roll success results in no refund | Prowess remains consumed | **PASS** |
| **ADV-MOS-4** | Mark of a Specialist on Level < 4 warns level | Level warning triggered | **PASS** |
| **ADV-FU-1** | Falling Upwards spends 3 Prowess + 1 reaction for auto-success | 3 Prowess & 1 reaction spent, autoSuccess true | **PASS** |
| **ADV-FU-2** | Falling Upwards on Level < 17 warns level | Level warning triggered | **PASS** |
| **ADV-FU-3** | Falling Upwards with < 3 Prowess warns shortfall; override clamps at 0 | Clamps at 0, receipt records shortfall | **PASS** |
| **ADV-FU-4A** | Falling Upwards when reaction is spent warns `reaction` | Warning omitted (`reactions.value` bug) | **FAIL (DEFECT 1)** |
| **ADV-WEAP-1** | Strict boolean gates at levels 1, 6, 12, 17, 18 | Feature unlock predicates match Ch. 3 | **PASS** |
| **ADV-WEAP-2** | Weapon Expertise Melee (+1 die) vs Ranged (Advantage) category validation | Cross-category usage rejected with warning | **PASS** |
| **ADV-WEAP-3** | Weapon Mastery Melee adds `floor(level / 2)` damage (9 to 10) | Scaling verified across Lv 18–20 | **PASS** |
| **ADV-WEAP-4** | Weapon Mastery Ranged adds `+PB` (+6) attack bonus | Scaling verified across Lv 18–20 | **PASS** |
| **ADV-WEAP-5A** | Defensive Style when reaction is spent warns `reaction` | Warning omitted (`reactions.value` bug) | **FAIL (DEFECT 1)** |
| **ADV-WEAP-5B** | Defensive Style reaction spend and undo | Reaction spent and restored upon undo | **PASS** |
| **ADV-UNDO-1** | Active use produces undo receipt under `flags.ak5e.specialistUses.undo` | Undo stack populated with complete receipt | **PASS** |
| **ADV-UNDO-2** | Multi-action sequence (Mark -> Expertise -> Falling Upwards) cleanly reverts | Every step restored in reverse order | **PASS** |
| **ADV-UNDO-3** | Undo after shortfall override restores exact `before` value (1, not 3) | Pool accurately restored to 1 | **PASS** |

---

## 4. Caveats

- Subclass branch specific features (Executor, Hookmaster, Infuser, Inventor, Skyranger, Dollkeeper, Trapmaster) are scheduled for subclass milestones; this review verified the base Specialist chassis and fighting styles.
- Outside of Defect 1 and Defect 2, the core Specialist implementation (hit points, proficiencies, saving throw choices, 15 fighting styles, idempotent progression, and pure DC formulas) is exceptionally well-structured and faithful to Chapter 3.

---

## 5. Conclusion & Actionable Mitigations

**Verdict:** **REQUEST_CHANGES**

The worker must address the following two concrete fixes:

1. **Fix Defect 1 in `ak5e/scripts/specialist-uses.mjs`:**
   - In `CORE_PLANS.itsAllSkill` (line 170): change `if (reactions.value < 1)` to `if (reactions.available < 1)`.
   - In `CORE_PLANS.defensiveStyle` (line 238): change `if (reactions.value < 1)` to `if (reactions.available < 1)`.

2. **Fix Defect 2 in `ak5e/scripts/specialist-features.mjs`:**
   - In `registerSpecialistHooks()` (lines 81–86): remove the redundant `Hooks.on("dnd5e.restCompleted", ...)` listener. Because `defineSpecialistPools()` already defines `recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]` on the `prowess` pool, `ResourcePools.registerResourcePoolHooks()` (at `ak5e.mjs:372`) automatically handles rest recovery cleanly without duplication.
   - Alternatively, if `onSpecialistRest` is retained for explicit logging or branch riders, remove the `recovery` array from `definePool({ id: "prowess", ... })` so recovery only occurs once per rest.

---

## 6. Verification Method

To verify the defects and validate fixes:

1. **Execute Specialist Adversarial Test Suite:**
   ```bash
   node --test ak5e/test/specialist-adversarial.test.mjs
   ```
   *Expected outcome prior to fix:* Confirms defects `ADV-FU-4A`, `ADV-WEAP-5A`, and `ADV-PROW-3B`.
   *Expected outcome after fix:* All 24 tests pass cleanly with 0 failing and 0 todo.

2. **Execute Full Specialist Test Suite:**
   ```bash
   npm run test:specialist
   ```

3. **Verify Reaction Warning Behavior:**
   ```bash
   node -e '
   import { setupFoundryGlobals, createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
   import { specialistUses } from "./ak5e/scripts/specialist-uses.mjs";
   import { spendReaction } from "./ak5e/scripts/trigger-events.mjs";
   setupFoundryGlobals();
   const actor = createTestActor({ items: [createTestItem({ name: "Specialist", type: "class", system: { levels: 17 } })], system: { attributes: { prof: 6 } }, flags: { ak5e: { specialist: { enabled: true } } } });
   await spendReaction(actor, { triggerId: "prior" });
   const plan = specialistUses.plan(actor, "itsAllSkill", {});
   console.log("Warnings:", plan.warnings);
   '
   ```
   *Verification criterion:* `plan.warnings` must contain `{ id: "reaction", text: "Reaction already expended this round." }`.
