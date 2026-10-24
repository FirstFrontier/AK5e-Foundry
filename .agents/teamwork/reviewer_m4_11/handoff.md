# Handoff Report — reviewer_m4_11

**Milestone**: Milestone 4 (Inventor Specialist Subclass: Table-Play & Sheet Integration Review)  
**Agent**: `reviewer_m4_11` (reviewer, critic)  
**Parent Orchestrator**: `orchestrator_10` (`cf5c8a2a-802f-473e-8274-6566de462e7c`)  
**Verdict**: **APPROVE**  

---

## 1. Observation

### 1.1 Automated Verification Commands and Tool Outputs
1. **Specialist Test Suite**:
   - Command: `npm run test:specialist`
   - Output: `ℹ tests 304 | ℹ pass 304 | ℹ fail 0 | ℹ duration_ms 626.557667`
   - Exit Code: `0`
2. **File Validation**:
   - Command: `node ak5e/tools/validate-files.mjs`
   - Output: `Validated module.json, lang/en.json, and 293 .mjs files.`
   - Exit Code: `0`
3. **Generated Content Verification**:
   - Command: `node ak5e/tools/verify-generated-content.mjs`
   - Output: `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source. Top-level records: 2193; Chapter 6 embedded features: 801.`
   - Exit Code: `0`
4. **Focused Inventor Table-Play Test Suite**:
   - Command: `node --test ak5e/test/inventor-uses.test.mjs ak5e/test/inventor-tableplay-adversarial.test.mjs`
   - Output: `ℹ tests 33 | ℹ pass 33 | ℹ fail 0 | ℹ duration_ms 280.443472`
   - Exit Code: `0`
5. **Base Classes Regression Test Suite**:
   - Command: `npm run test:base-classes`
   - Output: `304 pass (specialist), 61 pass (medic), all vanguard and supporter suites pass. Total tests pass with 0 failures.`
   - Exit Code: `0`

### 1.2 Production Implementation Observations
1. **`ak5e/scripts/specialist-uses.mjs`**:
   - **Plan Registrations** (lines 2120–2651):
     - `applyModification` (lines 2121–2207): Verifies `specialistEnabled(actor)` and `isInventor(actor)`. Validates modifiable, non-magical equipment (`warn(warnings, "magical", ...)`). Emits `shortfall` warning on empty Inventions pool (`getPool(actor, "inventions").value < 1`). Deducts 1 Invention via `spendResource(actor, receipt, { pool: "inventions", amount: 1, label: "Inventions" })`. Tracks `priorModifications` on receipt. Calculates Instability via `calculateInstability(item, actor, data)`.
     - `removeModification` (lines 2209–2288): Verifies installed modification on target item. Refunds 1 Invention unless marked as `isMobileModding`. Restores item modification array via `removeEquipmentModification`.
     - `activateModification` (lines 2290–2405): Emits `broken` warning if item is marked broken. Checks Life Support HP threshold (`warn(warnings, "lifeSupportHP", ...)` when current HP >= 50% max). Checks Adrenal Overloader frequency (`warn(warnings, "frequency", ...)`). Sets `receipt.formula = "${instability}d6"` with `receipt.rollLabel` and sets `receipt.result.status = "awaitingRoll"` without auto-evaluating dice. On dangerous breakdown, flags item broken.
     - `mobileModding` (lines 2407–2492): Level 5 check (`levelWarning(warnings, actor, 5, "Mobile Modding")`). Emits `shortfall` warning when Prowess < 1. Range check (`warn(warnings, "range", ...)` if > 5 ft). Willingness check (`warn(warnings, "willing", ...)`). Spends 1 Prowess (0 Inventions cost). Applies temporary 1-minute modification to target equipment.
     - `strangeContraption` (lines 2494–2563): Level 5 check (`levelWarning(warnings, actor, 5, ...)`). Range check (`warn(warnings, "range", ...)` if > 30 ft). Frequency check (`warn(warnings, "alreadyUsed", ...)` if used this LR). Populates `receipt.formula` for interactive card roll button when damage formula exists.
     - `theBigOne` (lines 2565–2650): Level 20 check (`levelWarning(warnings, actor, 20, ...)`). Frequency check (`warn(warnings, "alreadyUsed", ...)` if used this LR). Validates mode (FLASH: 8d6 thunder + burning, SHARD: 10d6 slashing + bleeding + ignores cover, QUASAR: 14d6 radiant). Populates `receipt.formula` and `status: "awaitingRoll"`.
   - **GM Relay `validateTarget`** (lines 2653–2658):
     ```js
     INVENTOR_PLANS.applyModification.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
     INVENTOR_PLANS.removeModification.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
     INVENTOR_PLANS.activateModification.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
     INVENTOR_PLANS.mobileModding.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
     INVENTOR_PLANS.strangeContraption.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
     INVENTOR_PLANS.theBigOne.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
     ```
   - **Encounter-Window Undo Cleanup** (lines 2660–2740, `inventorCleanup`):
     - `applyModification`: Filters out applied modification from item's `flags.ak5e.inventor.modifications`.
     - `removeModification`: Reinstalls `receipt.priorModifications` onto item.
     - `activateModification`: Clears `isBroken: false` on equipment if dangerous breakdown occurred.
     - `mobileModding`: Strips temporary mobile modification from target equipment.
     - `strangeContraption`: Removes contraption ID from `actor.flags.ak5e.inventor.usedContraptions`.
     - `theBigOne`: Resets `theBigOneUsed: false`.

2. **`ak5e/scripts/specialist-sheet.mjs`**:
   - **ActorSheetV2 Features Tab Badges** (lines 633–635):
     - Inventions badge: `getInventionsBadgeText(actor)` renders `Inventions: ${val} / ${max}` with class `.ak5e-specialist-badge-inventions`.
     - Inventor DC badge: `Inventor DC: ${calculateInventorDC(actor)}` with class `.ak5e-specialist-badge-inventor-dc`.
     - Active Mod Count badge: `getActiveModificationsCountText(actor)` renders `Active Modifications: ${count}` with class `.ak5e-specialist-badge-mod-count`.
   - **DialogV2 Action Controls** (lines 249–268):
     - `applyModification`, `removeModification`, `activateModification`, `mobileModding`, `strangeContraption`, `theBigOne`.
   - **Command Wiring** (lines 505–581):
     - All commands wrapped through `confirmPlayUse`:
       - Shows confirmation prompt with target/equipment/modification defaults.
       - Invokes `specialistUses.command(actor, cmd, { confirmed: true, ...extra }, operationId())`.
       - Non-blocking warnings trigger override prompt ("Use anyway").

3. **`TODO.md` and `ak5e/DECISIONS.md`**:
   - `TODO.md` (lines 974–983): Accurately logs source lines (L5847–6140), 144 unit/adversarial tests + 33 table-play tests (177 total), 304/304 full specialist suite green.
   - `ak5e/DECISIONS.md` (lines 2228–2256):
     - Ruling 1: Dangerous modifications add +1 extra Instability (+2 over base item); breakdown disables equipment only on Dangerous mod activation.
     - Ruling 2: Melee Attachment Attack Modifier defaults to 1d8 + DEX mod, with optional 1d8 + DEX mod + PB reading offered without blocking play.
     - Ruling 3: Instability rolls occur only on deliberate modification activation, not passive carry or standard attack.

---

## 2. Logic Chain

1. **Confirmation Before Spend (WORKFLOW.md §3.2)**:
   - *Observation*: Line 323 in `ak5e/scripts/play-uses.mjs` mandates `need(data.confirmed === true, "Confirm this use before applying it.")`.
   - *Observation*: In `ak5e/test/inventor-uses.test.mjs` (Area 1) and `ak5e/test/inventor-tableplay-adversarial.test.mjs` (Adversarial 1.1–1.6), unconfirmed calls to all 6 plans reject execution, leaving Inventions, Prowess, equipment modifications, actor HP, and undo receipts completely unchanged.
   - *Inference*: Plan execution and document mutations are strictly gated behind explicit confirmation. Canceling changes nothing.

2. **Non-blocking Warnings & "Use anyway" Overrides (WORKFLOW.md §3.2)**:
   - *Observation*: Shortfall, level requirements, broken equipment, Life Support HP thresholds, and range checks in `specialist-uses.mjs` call `warn(warnings, ...)` instead of `need(...)`.
   - *Observation*: In `ak5e/test/inventor-uses.test.mjs` (Area 2) and `ak5e/test/inventor-tableplay-adversarial.test.mjs` (Adversarial 2.1–2.4), un-overridden calls throw `AK5eWarnings` / `PlayWarnings`, while supplying `overrides: [...]` allows execution to complete smoothly.
   - *Inference*: Warnings guide players and GMs without deadlocking table play, adhering strictly to the "warn, never block" philosophy.

3. **Zero-Floor Clamping on Resource Shortfalls (WORKFLOW.md §3.2)**:
   - *Observation*: `spendResource` uses `const after = Math.max(0, before - amount)` and appends to `receipt.shortfalls`.
   - *Observation*: In `ak5e/test/inventor-tableplay-adversarial.test.mjs` (Adversarial 2.1, 2.2, 2.5), overriding an empty Inventions or Prowess pool clamps the pool at `0` (never `-1`). Undoing an overspent use restores the exact recorded prior value (`0`), without erroneously incrementing to `+1`.
   - *Inference*: Resource accounting maintains mathematical integrity under overdraw, and reversibility preserves exact baseline states.

4. **Never Auto-Roll Player Dice (WORKFLOW.md §3.2)**:
   - *Observation*: In `activateModification`, `strangeContraption`, and `theBigOne`, plans set `receipt.formula` and enter `status: "awaitingRoll"` without evaluating rolls.
   - *Observation*: In `ak5e/test/inventor-uses.test.mjs` (Area 5) and `ak5e/test/inventor-tableplay-adversarial.test.mjs` (Adversarial 3.1–3.4), dice formulas (`4d6`, `4d8`, `8d6`, `10d6`, `14d6`) remain unevaluated and actor/target HP remains un-mutated until `specialistUses.command(actor, "useRoll", { useId })` is explicitly clicked.
   - *Inference*: Player and GM agency over dice rolling is fully preserved; chat cards provide clickable roll buttons rather than evaluating rolls behind the scenes.

5. **Automatic GM Relay & validateTarget Verification (WORKFLOW.md §3.2)**:
   - *Observation*: All 6 Inventor plans register `validateTarget` predicates comparing `entry.uuid` and `receipt.targetUuid` against `target.uuid`.
   - *Observation*: In `ak5e/test/inventor-tableplay-adversarial.test.mjs` (Adversarial 4.1–4.4), mobile modding on an unowned ally item relays through the active GM without permission errors. Forged or mismatched target entries are rejected by `validateTarget`, and running without an active GM cleanly raises `NoGM`.
   - *Inference*: Target mutations across player/GM boundaries are secure against forged client requests while avoiding disruptive human approval popups.

6. **Encounter-Window Undo Integrity (WORKFLOW.md §3.2)**:
   - *Observation*: Every action persists a structured receipt under `flags.ak5e.specialistUses.undo`.
   - *Observation*: In `ak5e/test/inventor-uses.test.mjs` (Area 6) and `ak5e/test/inventor-tableplay-adversarial.test.mjs` (Adversarial 5.1–5.7), calling `specialistUses.undo()` cleanly reverts applied modifications, re-installs removed modifications, clears dangerous breakdown broken flags, strips mobile mods, clears 1/LR contraption and Big One lockouts, and preserves out-of-order independent actions.
   - *Inference*: The undo engine provides complete, battle-tested reversibility within the encounter window.

7. **Integrity Audit**:
   - *Observation*: Source inspection of `ak5e/scripts/specialist-uses.mjs`, `ak5e/scripts/specialist-sheet.mjs`, and `ak5e/scripts/inventor-features.mjs` reveals zero hardcoded test strings, zero mock shortcuts, and complete dynamic implementations of all 28 standard and 3 dangerous modifications, 8 strange and 8 stranger contraptions, Instability math, breakdown dice matching logic, and sheet badges.
   - *Inference*: Zero integrity violations exist.

---

## 3. Caveats

- **Live Browser Headless Session**: Live browser validation (`ak5e/tools/test-specialist-live.mjs`) and visual screenshot inspection (screenshots 18–22) were executed and audited by the implementer/validator during the active run; this review focused on code inspection, adversarial stress testing, and automated test suite verification.
- **`TODO.md` Checkbox**: In `TODO.md` line 976, `- [ ] Cross-verified by Codex or Claude` remains open for parent/orchestrator closure upon milestone handoff. Per the review-only constraint, this reviewer made no edits to `TODO.md`.

---

## 4. Conclusion

The Milestone 4 implementation of the AK5e Inventor Specialist Subclass in `ak5e/scripts/specialist-uses.mjs` and `ak5e/scripts/specialist-sheet.mjs` is **complete, robust, and in full compliance with WORKFLOW.md §3.2 table-play philosophy and Chapter 3 source rules**. 

All 304 specialist tests and 33 focused table-play/adversarial tests pass with 0 failures, file validators exit 0, and no integrity violations were detected.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method

To independently verify this report:

1. **Run Specialist Test Suite**:
   ```bash
   npm run test:specialist
   ```
   *Expected outcome*: 304/304 tests pass with 0 failures.

2. **Run Focused Inventor Table-Play & Adversarial Suites**:
   ```bash
   node --test ak5e/test/inventor-uses.test.mjs ak5e/test/inventor-tableplay-adversarial.test.mjs
   ```
   *Expected outcome*: 33/33 tests pass with 0 failures.

3. **Run Static Content & Syntax Validators**:
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: Exits code 0 with 0 errors.

4. **Run Full Base Classes Regression**:
   ```bash
   npm run test:base-classes
   ```
   *Expected outcome*: All base class suites (Vanguard, Supporter, Specialist, Medic) pass 100%.

5. **Inspect Files**:
   - `ak5e/scripts/specialist-uses.mjs` (lines 2120–2740)
   - `ak5e/scripts/specialist-sheet.mjs` (lines 249–268, 505–581, 633–635)
   - `ak5e/DECISIONS.md` (lines 2228–2256)
   - `TODO.md` (lines 974–983)
