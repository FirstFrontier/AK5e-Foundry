# Handoff Report — Milestone 4 Iteration 2: Specialist Base Class Adversarial Verification

**Agent:** `challenger_m4_1_it2`  
**Milestone:** M4 Iteration 2 (Specialist Base Character Class Remediation)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_1_it2/`  
**Verdict:** **APPROVE**

---

## 1. Observation

### 1.1 Remediation Code Verification

1. **`ak5e/scripts/specialist-uses.mjs:169–173` & `237–241`:**
   ```javascript
   169:     const reactions = getReactions(actor);
   170:     if (!reactions?.available) {
   171:       warn(warnings, "reaction", "Reaction already expended this round.");
   172:     }
   ...
   237:     const reactions = getReactions(actor);
   238:     if (!reactions?.available) {
   239:       warn(warnings, "reaction", "Reaction already expended this round.");
   240:     }
   ```
   *Verification:* Replaced defective `reactions.value < 1` with `!reactions?.available`. `getReactions(actor)` in `trigger-events.mjs:484–485` provides `available: Math.max(0, state.max - state.spent) + ...`. When reactions are spent (`available: 0`), `!reactions?.available` evaluates to `true`, correctly emitting the non-blocking warning.

2. **`ak5e/scripts/specialist-features.mjs:76–81`:**
   ```javascript
   76: export function registerSpecialistHooks() {
   77:   if (hooksInstalled === globalThis.Hooks) return;
   78:   hooksInstalled = globalThis.Hooks;
   79:   defineSpecialistPools();
   80:   registerResourcePoolHooks();
   81: }
   ```
   *Verification:* The redundant second `Hooks.on("dnd5e.restCompleted")` listener has been completely eliminated. `registerSpecialistHooks()` delegates directly to `registerResourcePoolHooks()` from `resource-pools.mjs`.

3. **`ak5e/scripts/specialist-progression.mjs:447–452`:**
   ```javascript
   447:   const style = choices.fightingStyle;
   448:   const categoryStyles = weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : (weaponCat === "melee" ? MELEE_FIGHTING_STYLES : []);
   449:   const styleObj = categoryStyles.find(s => s.id === style);
   450:   if (!style || !styleObj) {
   451:     pending.push("fightingStyle");
   452:   }
   ```
   *Verification:* `choices.fightingStyle` is validated against `categoryStyles` corresponding strictly to `choices.weaponCategory`. Mismatched combinations append `"fightingStyle"` to `pending`.

### 1.2 Verbatim Test Executions

1. **Adversarial Suite Execution (`ak5e/test/specialist-adversarial.test.mjs`):**
   Command: `node --test ak5e/test/specialist-adversarial.test.mjs`
   Output:
   ```text
   ✔ ADV-PROW-1: Prowess pool max scales strictly with Proficiency Bonus across levels 1–20 (8.571011ms)
   ✔ ADV-PROW-2: Initial Prowess value is 0, requiring rest or refund before use (0.558014ms)
   ✔ ADV-PROW-3A: Short Rest restores 1 Prowess and Long Rest restores 1 Prowess (bounded at max) (2.279607ms)
   ✔ ADV-PROW-3B: Rest via dnd5e.restCompleted hook recovers exactly 1 Prowess (no duplicate hook) (1.084759ms)
   ✔ ADV-PROW-4: Pre-level 4 actors do not gain Prowess on rests (0.44073ms)
   ✔ ADV-PROW-5: Zero-floor clamping on overspend and shortfall warnings with overrides (2.262384ms)
   ✔ ADV-MOS-1: Spend 1 Prowess on proficient ability check reroll (0.957635ms)
   ✔ ADV-MOS-2: Refund of 1 Prowess if second roll is also a failure (1.260062ms)
   ✔ ADV-MOS-3: Successful second roll results in no refund (Prowess remains spent) (0.814583ms)
   ✔ ADV-MOS-4: Level requirement check (Level < 4 triggers level warning) (0.448606ms)
   ✔ ADV-FU-1: Spend 3 Prowess and 1 reaction to auto-succeed on saving throw (1.291172ms)
   ✔ ADV-FU-2: Level < 17 triggers level warning (0.378652ms)
   ✔ ADV-FU-3: Shortfall behavior when Prowess < 3 (warns and clamps at 0 if overridden) (1.43219ms)
   ✔ ADV-FU-4: Reaction already spent triggers reaction warning for itsAllSkill (0.570137ms)
   ✔ ADV-WEAP-1: Level unlock gates for all weapon progression tiers (0.521504ms)
   ✔ ADV-WEAP-2: Weapon Expertise Melee vs Ranged choice enforcement and bonus (2.590089ms)
   ✔ ADV-WEAP-3: Weapon Mastery Melee bonus scales to floor(level / 2) (0.977794ms)
   ✔ ADV-WEAP-4: Weapon Mastery Ranged bonus doubles PB (+PB attack bonus) (0.775969ms)
   ✔ ADV-WEAP-5A: Defensive Fighting Style emits reaction warning when reaction is spent (0.444868ms)
   ✔ ADV-WEAP-5B: Defensive Fighting Style reaction consumption and clean reversible undo (1.05922ms)
   ✔ ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo (0.489754ms)
   ✔ ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration (1.587567ms)
   ✔ ADV-UNDO-3: Undo with shortfall override correctly restores 'before' value, not theoretical cost (0.93358ms)
   ✔ ADV-PROG-STYLE: previewSpecialistProgression cross-validates fightingStyle against weaponCategory (7.60517ms)
   ℹ tests 24
   ℹ suites 0
   ℹ pass 24
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 193.942242
   ```

2. **Full Specialist Suite (`npm run test:specialist`):**
   Command: `npm run test:specialist`
   Output:
   ```text
   ℹ tests 48
   ℹ suites 0
   ℹ pass 48
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 206.670019
   ```

3. **Progression Stress Harness (`node ak5e/tools/stress-specialist-progression.mjs`):**
   Command: `node ak5e/tools/stress-specialist-progression.mjs`
   Output:
   ```text
   === SUMMARY OF ADVERSARIAL STRESS HARNESS ===
   Passed: 17/17, Failed: 0/17
   ```

4. **Base Classes Test Battery (`npm run test:base-classes`):**
   Command: `npm run test:base-classes`
   Output: All Vanguard (48 tests), Supporter (44 tests), and Specialist (48 tests) passed cleanly (exit code 0).

5. **Static and Source Verification Tools:**
   - `node ak5e/tools/validate-files.mjs`: `Validated module.json, lang/en.json, and 251 .mjs files.` (exit code 0)
   - `node ak5e/tools/verify-generated-content.mjs`: `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source. Top-level records: 2193; Chapter 6 embedded features: 801.` (exit code 0)

6. **Repository Full Test Suite (`npm test`):**
   Command: `npm test`
   Result: Exit code 0 across all unit, integration, and rules suites.

### 1.3 Custom Empirical Stress-Test Execution

Four custom adversarial stress suites were executed against the codebase:

1. **Suite 1: Reaction Warnings & Overrides (5/5 PASS)**:
   - `itsAllSkill` with `available: 1`: 0 reaction warnings emitted.
   - `itsAllSkill` with `available: 0`: Throws `PlayWarnings` with `{ id: "reaction" }`.
   - `itsAllSkill` with `available: 0` and `overrides: ["reaction"]`: Plan allowed, preserves warning record.
   - `itsAllSkill` dual shortfall + reaction spent: Both warnings emitted simultaneously; overriding both clamps Prowess at 0, records reaction, and undo cleanly restores Prowess to exact prior value (1) and reaction budget.
   - `defensiveStyle`: Emits reaction warning when `available: 0`, allows execution with override, and reversibly undoes.

2. **Suite 2: Prowess Rest Recovery in Live Hook Contexts (5/5 PASS)**:
   - Hook registration idempotency: Calling `registerSpecialistHooks()` and `registerResourcePoolHooks()` multiple times registers only a single listener on `globalThis.Hooks`.
   - Level 4 actor (PB=2): Short Rest 1 restores 1 (0 -> 1); Short Rest 2 restores 1 (1 -> 2); Short Rest 3 and Long Rest clamp at 2.
   - Level 13 actor (PB=5): 8 mixed rests follow strict progression `[1, 2, 3, 4, 5, 5, 5, 5]` without a single +2 spike.
   - Pre-Level 4 actors (Levels 1–3): Recover 0 Prowess across short and long rests.
   - Disabled specialist: Recovers 0 Prowess on rest.

3. **Suite 3: Fighting Style Cross-Category Exhaustive Permutations (6/6 PASS)**:
   - All 8 Melee styles (`duelling`, `greatWeapon`, `twoWeapon`, `protection`, `defence`, `interception`, `unarmed`, `blindFighting`) valid when `weaponCategory: "melee"`.
   - All 8 Melee styles rejected (`pending.includes("fightingStyle")`) when `weaponCategory: "ranged"`.
   - All 7 Ranged styles valid when `weaponCategory: "ranged"`.
   - All 7 Ranged styles rejected (`pending.includes("fightingStyle")`) when `weaponCategory: "melee"`.
   - Bogus style IDs (`""`, `"banana"`, `null`, `undefined`, `123`) rejected.
   - Invalid weapon categories (`""`, `"magic"`, `"versatile"`, `null`) reject both category and style.

4. **Suite 4: Reaction Refresh Cycle & Combat Reversibility (3/3 PASS)**:
   - Reaction lifecycle: fresh -> spent (warns) -> `refreshReactions(actor)` (warning cleared).
   - Interleaved 4-action chain (`markOfASpecialist` -> `defensiveStyle` -> `weaponMasteryMelee` -> `itsAllSkill`) cleanly reverts in reverse order.
   - Weapon Mastery Melee vs Ranged category exclusivity enforced.

---

## 2. Logic Chain

1. **WORKFLOW §3.2 Compliance (Warning on Spent Reactions)**:
   - WORKFLOW §3.2 requires: "Warn but never block on range or prerequisites. Always confirm before a use."
   - In Observation 1.1 (1) and Observation 1.3 (Suite 1), when `getReactions(actor).available === 0`, `!reactions?.available` evaluates to `true`.
   - Both `itsAllSkill` and `defensiveStyle` push `{ id: "reaction", text: "Reaction already expended this round." }` into `warnings`.
   - Un-overridden calls throw `PlayWarnings`, prompting the user confirmation dialog.
   - Overriding with `overrides: ["reaction"]` allows execution, clamps resources if short, and logs undo receipts.
   - This directly and completely resolves Defect 1 from Iteration 1.

2. **Rules Authority Adherence (Chapter 3 L5315 — Rest Recovery)**:
   - Chapter 3 L5315 dictates: "You gain 1 Prowess whenever you complete a Short or Long Rest."
   - In Observation 1.1 (2) and Observation 1.3 (Suite 2), removing the redundant `dnd5e.restCompleted` listener leaves `ResourcePools.registerResourcePoolHooks()` as the sole handler.
   - Empirical testing across single, repeated, and mixed rests proves Prowess increases by exactly 1 per rest up to PB cap. No test observed +2 recovery.
   - This directly and completely resolves Defect 2 from Iteration 1.

3. **Progression Choice Integrity (Chapter 3 L5190–5200)**:
   - Melee and Ranged fighting styles are distinct talent groups.
   - In Observation 1.1 (3) and Observation 1.3 (Suite 3), `previewSpecialistProgression` validates `fightingStyle` strictly against `categoryStyles`.
   - All 15 fighting styles are validated against both matching and mismatched weapon categories, with 100% correct acceptance and rejection.
   - This directly resolves Defect 3 from Iteration 1.

4. **Adversarial Gate Clearance**:
   - `ak5e/test/specialist-adversarial.test.mjs` executes 24 tests with 24 passes, 0 failures, 0 skipped, and 0 todo.
   - `npm run test:specialist` executes 48 tests with 48 passes.
   - `npm run test:base-classes` and `npm test` execute cleanly with exit code 0.
   - This directly resolves Defect 4 from Iteration 1.

---

## 3. Stress Test Results Matrix

| Scenario / Test ID | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| **ADV-PROW-1** | Prowess max equals `@prof` (scales 2 to 6 across Lv 1–20) | Max strictly equals PB at all 20 levels | **PASS** |
| **ADV-PROW-2** | Initial Prowess value is 0 on new Specialist | Initial value is 0 | **PASS** |
| **ADV-PROW-3A** | Short & Long rest recover exactly 1 Prowess up to max | Recovers 1 per rest in isolation | **PASS** |
| **ADV-PROW-3B** | Hook firing on `dnd5e.restCompleted` recovers exactly 1 Prowess | Recovers exactly 1 Prowess | **PASS** |
| **ADV-PROW-4** | Level < 4 Specialist gains no Prowess on rest | Recovers 0 on rest | **PASS** |
| **ADV-PROW-5** | Spending with 0 Prowess warns shortfall; override clamps at 0 | Clamps at 0, receipt records shortfall | **PASS** |
| **ADV-MOS-1** | Mark of a Specialist spends 1 Prowess on check reroll | Spends 1 Prowess, records refundable=true | **PASS** |
| **ADV-MOS-2** | Second failure refunds 1 Prowess | 1 Prowess restored to pool | **PASS** |
| **ADV-MOS-3** | Second roll success results in no refund | Prowess remains consumed | **PASS** |
| **ADV-MOS-4** | Mark of a Specialist on Level < 4 warns level | Level warning triggered | **PASS** |
| **ADV-FU-1** | Falling Upwards spends 3 Prowess + 1 reaction for auto-success | 3 Prowess & 1 reaction spent, autoSuccess true | **PASS** |
| **ADV-FU-2** | Falling Upwards on Level < 17 warns level | Level warning triggered | **PASS** |
| **ADV-FU-3** | Falling Upwards with < 3 Prowess warns shortfall; override clamps at 0 | Clamps at 0, receipt records shortfall | **PASS** |
| **ADV-FU-4** | Falling Upwards when reaction is spent emits reaction warning | Warning emitted (`!reactions?.available`) | **PASS** |
| **ADV-WEAP-1** | Strict boolean gates at levels 1, 6, 12, 17, 18 | Feature unlock predicates match Ch. 3 | **PASS** |
| **ADV-WEAP-2** | Weapon Expertise Melee vs Ranged choice enforcement and bonus | Cross-category usage rejected with warning | **PASS** |
| **ADV-WEAP-3** | Weapon Mastery Melee adds `floor(level / 2)` damage (9 to 10) | Scaling verified across Lv 18–20 | **PASS** |
| **ADV-WEAP-4** | Weapon Mastery Ranged adds `+PB` (+6) attack bonus | Scaling verified across Lv 18–20 | **PASS** |
| **ADV-WEAP-5A** | Defensive Style when reaction is spent emits reaction warning | Warning emitted (`!reactions?.available`) | **PASS** |
| **ADV-WEAP-5B** | Defensive Style reaction spend and undo | Reaction spent and restored upon undo | **PASS** |
| **ADV-UNDO-1** | Active use produces undo receipt under `flags.ak5e.specialistUses.undo` | Undo stack populated with complete receipt | **PASS** |
| **ADV-UNDO-2** | Multi-action sequence cleanly reverts | Every step restored in reverse order | **PASS** |
| **ADV-UNDO-3** | Undo after shortfall override restores exact `before` value | Pool accurately restored to 1 | **PASS** |
| **ADV-PROG-STYLE** | `previewSpecialistProgression` rejects cross-category fighting styles | Category mismatch flagged in pending | **PASS** |
| **STRESS-REST-8x** | 8 mixed rests on Level 13 actor follow `[1, 2, 3, 4, 5, 5, 5, 5]` | Exact progression verified, zero +2 spikes | **PASS** |
| **STRESS-STYLE-15x**| All 15 fighting styles tested across Melee & Ranged categories | 100% correct acceptance and rejection | **PASS** |

---

## 4. Caveats

- Subclass implementations (Executor, Hookmaster, Infuser, Inventor, Skyranger, Dollkeeper, Trapmaster) are scheduled for dedicated subclass milestones per `PROJECT.md`; these validations apply strictly to the base Specialist class chassis and fighting styles.
- No other caveats.

---

## 5. Conclusion

**Final Verdict:** **APPROVE**

The remediations implemented by `worker_m4_it2` have been empirically executed, verified, and stress-tested under adverse conditions. All four defects from Iteration 1 have been completely resolved:
1. `ak5e/scripts/specialist-uses.mjs`: Reaction warnings on `itsAllSkill` and `defensiveStyle` trigger reliably when reactions are spent (`available: 0`).
2. `ak5e/scripts/specialist-features.mjs`: Redundant rest hook removed; live hook rest recovery restores exactly 1 Prowess per rest up to PB cap.
3. `ak5e/scripts/specialist-progression.mjs`: Fighting styles cross-validate strictly against the chosen weapon category.
4. `ak5e/test/specialist-adversarial.test.mjs`: 100% pass rate (24/24 tests pass, 0 fail, 0 skipped, 0 todo).
5. All regression batteries (`npm run test:specialist`, `npm run test:base-classes`, `npm test`, `validate-files.mjs`, `verify-generated-content.mjs`) pass with 0 errors.

---

## 6. Verification Method

To independently reproduce and verify this assessment:

1. **Run the Specialist Adversarial Suite:**
   ```bash
   node --test ak5e/test/specialist-adversarial.test.mjs
   ```
   *Expected Result:* 24 passed, 0 failed, 0 todo.

2. **Run the Complete Specialist Test Battery:**
   ```bash
   npm run test:specialist
   ```
   *Expected Result:* 48 passed, 0 failed.

3. **Run the Progression Adversarial Stress Harness:**
   ```bash
   node ak5e/tools/stress-specialist-progression.mjs
   ```
   *Expected Result:* Passed: 17/17, Failed: 0/17.

4. **Run Base Classes and Full Repository Regression Suite:**
   ```bash
   npm run test:base-classes
   npm test
   ```
   *Expected Result:* Exit code 0 across all suites.
