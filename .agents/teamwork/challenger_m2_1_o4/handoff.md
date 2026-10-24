# Handoff Report: Milestone 2 — Vanguard Base Class Adversarial Verification

**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

Adversarial stress-testing of Milestone 2 (Vanguard Base Class) was conducted using Node.js execution and an empirical test suite authored at `ak5e/test/vanguard-adversarial.test.mjs`. The following empirical failures and code defects were directly observed:

### Observation 1.1: Runtime `ReferenceError` in `vanguardUses.execute(actor, "nimble")`
- **File**: `ak5e/scripts/vanguard-uses.mjs:253`
- **Verbatim Code**:
  ```javascript
  253: const current = flag(actor, "vanguard.nimbleTargets") ?? [];
  ```
- **Observed Behavior**:
  `flag` is not imported in `vanguard-uses.mjs`. Calling `vanguardUses.execute(actor, "nimble", { targetUuid: enemy.uuid, targetName: enemy.name, confirmation: true })` throws:
  ```
  ReferenceError: flag is not defined
      at Object.apply (file:///home/patch/AK5e-Foundry/ak5e/scripts/vanguard-uses.mjs:253:25)
      at file:///home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs:336:34
      at async vanguardUses.execute (file:///home/patch/AK5e-Foundry/ak5e/scripts/vanguard-uses.mjs:320:10)
  ```
- **Reproduced by**: Test `ADV-NIMBLE-1` in `ak5e/test/vanguard-adversarial.test.mjs`.

### Observation 1.2: Table-Play Unrolled Tip of the Spear Fails `useRoll` Flow
- **File**: `ak5e/scripts/vanguard-uses.mjs:90-92, 104-208`
- **Verbatim Code**:
  ```javascript
  90: rolls: (!directed && choice === null)
  91:   ? [{ id: "tipRoll", label: "Tip of the Spear (1d6)", formula: "1d6" }]
  92:   : [],
  ...
  205: } else {
  206:   receipt.summary = `${actor.name} invokes Tip of the Spear targeting ${targetName}. Click Roll to determine the outcome.`;
  207:   receipt.status = "awaitingRoll";
  208: }
  ```
- **Observed Behavior**:
  1. `receipt.formula` is never assigned on `receipt`.
  2. Because `receipt.formula` is undefined, `play-uses.mjs:300` evaluates:
     `receipt.status = receipt.targets?.some(entry => !entry.ready) || (receipt.damageParts?.length && receipt.roll === undefined) || (receipt.formula && receipt.roll === undefined) ? "awaitingRoll" : "complete";`
     which immediately resets `receipt.status` from `"awaitingRoll"` to `"complete"`.
  3. When the user clicks the roll button on the chat card (calling `vanguardUses.command(actor, "useRoll", { useId })`), `play-uses.mjs:348` executes `need(receipt?.formula, "Choose a use that is waiting for its roll.")` and aborts with:
     ```
     Error: Choose a use that is waiting for its roll.
         at need (file:///home/patch/AK5e-Foundry/ak5e/scripts/operation-kernel.mjs:9:69)
         at useRoll (file:///home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs:348:5)
     ```
  4. Even if `receipt.formula` were set, `useRoll` never populates `receipt.targets` or re-evaluates `plan.apply`, meaning no outcome (1–6) is ever resolved or applied to the target creature.
- **Reproduced by**: Test `ADV-TIP-1` in `ak5e/test/vanguard-adversarial.test.mjs`.

### Observation 1.3: Engine Crash on Reaction Warning Override ("Use anyway")
- **File**: `ak5e/scripts/vanguard-uses.mjs:101, 235`
- **Verbatim Code**:
  ```javascript
  101: receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
  ...
  235: receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
  ```
- **Observed Behavior**:
  Both `uncannyDodge` and `tipOfTheSpear` (directed) create `receipt.reaction` without `triggerId`. When a character has no reaction left and overrides the warning with "Use anyway" per WORKFLOW §3.2, `rx.ok` is `false`. In `play-uses.mjs:278`, `finish` calls:
  `spendReaction(actor, { triggerId: reaction.triggerId, ... })`
  Because `reaction.triggerId` is `undefined`, `spendReaction` throws:
  `Error: A Reaction must name the trigger it responds to (triggerId).`
  Which aborts `finish` with:
  ```
  Error: Not applied yet: A Reaction must name the trigger it responds to (triggerId). The use is recorded; retry it from the panel.
      at finish (file:///home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs:288:15)
  ```
- **Reproduced by**: Tests `ADV-RX-1` and `ADV-RX-2` in `ak5e/test/vanguard-adversarial.test.mjs`.

### Observation 1.4: Level 1 Vanguard Can Choose Tip of the Spear Outcome Without Rolling
- **File**: `ak5e/scripts/vanguard-uses.mjs:73-84, 104`
- **Observed Behavior**:
  Source L8046-8048 establishes that Directed Engagement is a 15th-level feature. At levels 1–14, Tip of the Spear must roll 1d6 (L7997). In `vanguard-uses.mjs`, level 15 validation and reaction spending only occur `if (directed)`. If a caller supplies `{ choice: 4, directed: false }`, zero warnings are raised, no reaction is spent, and outcome 4 is applied unconditionally to a Level 1 character.
- **Reproduced by**: Test `ADV-TIP-2` in `ak5e/test/vanguard-adversarial.test.mjs`.

### Observation 1.5: Tip of the Spear Outcomes 5 & 6 Missing Benefit Metadata
- **File**: `ak5e/scripts/vanguard-uses.mjs:166-203`
- **Observed Behavior**:
  `tip-of-the-spear.mjs` implements `tipCritReduction` and `useTipSP` by filtering active effects for `flag(e, "standardBenefit")?.kind === "tip5"` and `"tip6"`.
  In `vanguard-uses.mjs`, `receipt.targets` creates effects without setting `standardBenefit` metadata. Consequently:
  - `tipCritReduction(ally)` returns `0` and `tipCritThreshold(ally, 20)` remains `20` (Crit range increase is completely non-functional).
  - Calling `useTipSP(ally, ...)` throws: `Error: The recipient has no active Tip SP benefit.`
- **Reproduced by**: Tests `ADV-TIP-3` and `ADV-TIP-4` in `ak5e/test/vanguard-adversarial.test.mjs`.

### Observation 1.6: Tip of the Spear Outcome 1 Has No Target Tracking
- **File**: `ak5e/scripts/vanguard-uses.mjs:111-113`
- **Observed Behavior**:
  Outcome 1 (+PB damage on one damage roll) sets `receipt.summary` and `receipt.result`, but leaves `receipt.targets` empty `[]`. The recipient receives no active effect, flag, or card tag tracking the damage bonus.

### Observation 1.7: Directed Engagement Per-Turn Duration Ignored
- **File**: `ak5e/scripts/vanguard-uses.mjs:78-83, 100-101`
- **Observed Behavior**:
  Source L8047 specifies that expending a Reaction allows choosing Tip effects "until the end of that Turn". `vanguard-features.mjs` provides `isDirectedEngagementActive(actor)`, but `vanguard-uses.mjs` ignores it and demands a fresh Reaction on every single Tip use, preventing legitimate multi-use turns (e.g. Leading Lance).

---

## 2. Logic Chain

1. **Table-Play Philosophy (WORKFLOW §3.2)**: Every feature use must support table-play interaction without auto-rolling player dice, allowing roll buttons to be clicked from chat cards (`useRoll`), allowing non-blocking warnings to be overridden with "Use anyway", and maintaining clean undo reversibility within the encounter window.
2. **Defect in unrolled Tip flow**: By failing to set `receipt.formula` and failing to provide a roll-resolution handler in `useRoll`, regular table-play use of Tip of the Spear (where players roll 1d6) crashes upon clicking the Roll button, making the core Level 1 class feature unusable as intended (Observation 1.2).
3. **Defect in warning overrides**: By omitting `triggerId` in `receipt.reaction`, whenever a table-play participant overrides the "no reaction available" warning on Uncanny Dodge or Directed Engagement, the engine crashes on `spendReaction` (Observation 1.3).
4. **Defect in Nimble plan**: A missing import of `flag` causes a fatal `ReferenceError` as soon as the `nimble` plan is invoked (Observation 1.1).
5. **Defect in rules fidelity**: Failing to gate `choice` behind level 15 allows low-level Vanguards to pick optimal table outcomes rather than rolling (Observation 1.4). Failing to write `standardBenefit` metadata renders Outcomes 5 and 6 non-functional with the shared engine (Observation 1.5).
6. **Conclusion**: Because 3 critical defects cause unhandled errors or engine crashes, and 2 high defects break core rules mechanics and feature integration, Milestone 2 cannot be approved in its current state.

---

## 3. Caveats

- Additive Temporary HP accumulation, clamping, and partial-damage undo were verified to work accurately (`ADV-THP-1`, `ADV-THP-2`).
- Approaching Storm damage scaling (+floor(Level / 2)) was verified across all 20 levels (`ADV-STORM-1`).
- Lightspeed initiative deduction (Initiative - 10) was verified including negative initiative handling (`ADV-LIGHT-1`).
- Setup and progression idempotency tests pass cleanly.
- No other base classes (Supporter, Specialist, Medic) were investigated as this milestone is strictly scoped to Vanguard Base Class.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The Vanguard Base Class implementation has critical regressions in table-play execution, error handling on warning overrides, runtime variable scope, and feature integration.

### Actionable Remediation Required:
1. In `ak5e/scripts/vanguard-uses.mjs`:
   - Import `flag` from `./vanguard-rules.mjs` (or `./operation-kernel.mjs`).
   - In `receipt.reaction` (both `tipOfTheSpear` and `uncannyDodge`), add `triggerId: `${receipt.id}-...``.
   - In `tipOfTheSpear`:
     - If `choice` is provided, require `directed: true` (or warn if Vanguard level < 15).
     - If `choice === null`, ensure `receipt.formula = "1d6"` is set, and wire `receipt.targets` and outcome resolution so that when `useRoll` evaluates `receipt.roll`, the corresponding outcome (1–6) is applied to the recipient.
     - For outcome 5 and outcome 6, include `standardBenefit: { kind: "tip5" }` and `{ kind: "tip6" }` metadata so `tipCritReduction` and `useTipSP` operate correctly.
     - For outcome 1, attach a tagged effect or recipient tracking for the +PB damage bonus.
     - Check `isDirectedEngagementActive(actor)` before demanding a reaction if Directed Engagement was already activated this turn.

---

## 5. Verification Method

To independently verify these findings:
1. Run the newly authored adversarial stress test suite:
   ```bash
   node --test ak5e/test/vanguard-adversarial.test.mjs
   ```
   **Expected**: 12/12 adversarial tests execute cleanly, demonstrating and asserting each specific failure mode and bug documented above.
2. Run file validation:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   **Expected**: Validates 231 .mjs files with exit code 0.
3. Run the full Vanguard test suite:
   ```bash
   npm run test:vanguard
   ```
   **Expected**: 74 tests pass across all suites.
