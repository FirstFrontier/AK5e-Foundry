# Handoff Report: Independent Table Play and UI Review for AK5e Medic Base Class, Physician, and Triage

**Reviewer**: `reviewer_medic_2` (Roles: reviewer, critic)  
**Date**: 2026-10-13  
**Target Files**: `ak5e/scripts/medic-uses.mjs`, `ak5e/scripts/medic-sheet.mjs`, `ak5e/scripts/ak5e.mjs`  
**Interface Contracts**: `PROJECT.md`, `WORKFLOW.md` (§3.2), `GEMINI.md`, `ORIGINAL_REQUEST.md` (Follow-up 2026-10-13T03:54:12Z)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Direct Code Observations
1. **Missing `validateTarget` on all Medic plans (`ak5e/scripts/medic-uses.mjs`)**:
   - Lines 84–125 (`touchHeal`), Lines 172–213 (`resuscitation`), Lines 426–471 (`stopTheFlow`), Lines 369–404 (`onTheScene`): None of these plans implement `validateTarget(source, receipt, entry, target)`.
   - In `ak5e/scripts/play-uses.mjs` Line 207:
     ```javascript
     if (command === "apply") need(PLANS[receipt.command]?.validateTarget?.(source, receipt, entry, target) === true, "The recorded change is not one this use can make.");
     ```
   - In `ak5e/DECISIONS.md` Lines 404–405:
     ```markdown
     The same rule applies to the Defender engine (`play-uses.mjs`): a plan without `validateTarget` cannot change other players' Creatures through the relay.
     ```
   - Verification command:
     ```bash
     node -e '
     import { medicUses } from "./ak5e/scripts/medic-uses.mjs";
     import { setupFoundryGlobals, createTestActor } from "./ak5e/test/base-classes-fixture.mjs";
     import { defineMedicPools, setLifeSupport } from "./ak5e/scripts/medic-features.mjs";
     setupFoundryGlobals(); defineMedicPools();
     const medic = createTestActor({ name: "Medic", class: "class-medic", level: 1 });
     medic.flags.ak5e = { medic: { enabled: true, spellcastingAbility: "int" } };
     setLifeSupport(medic, 50, "setup");
     const patient = createTestActor({ name: "Patient", level: 1 });
     patient.system.attributes.hp = { value: 10, max: 30 };
     await medicUses.command(medic, "touchHeal", { confirmed: true, amount: 10, targetUuid: patient.uuid }, "op-1");
     await medicUses.relayedTargetChange(medic, "apply", { useId: "op-1", targetUuid: patient.uuid });
     '
     ```
     Result: Throws `Error: The recorded change is not one this use can make.`

2. **Dice Formulas Not Bound to Receipts for Rolling (`ak5e/scripts/medic-uses.mjs`)**:
   - `onTheScene` (Lines 392, 394–401): Returns `rolls: [{ id: "sceneDice", label: "On the Scene: Heal or Harm Roll", formula: dieFormula }]`, but in `apply(next, receipt)` never sets `receipt.formula`.
   - `mobileHospital` (Lines 507, 509–513): Returns `rolls: [{ id: "auraHeal", label: "Mobile Hospital Aura Healing", formula: healFormula }]`, but in `apply(next, receipt)` never sets `receipt.formula`.
   - `intravenousLine` (Lines 275–277): Returns `rolls: isUnwilling ? [{ id: "saveDamage", ... }] : []`, but never sets `receipt.formula`.
   - In `ak5e/scripts/play-uses.mjs` Line 300:
     ```javascript
     receipt.status = receipt.targets?.some(entry => !entry.ready) || (receipt.damageParts?.length && receipt.roll === undefined) || (receipt.formula && receipt.roll === undefined) ? "awaitingRoll" : "complete";
     ```
     Because `receipt.formula` is undefined, `receipt.status` is set to `"complete"`.
   - In `ak5e/scripts/play-uses-sheet.mjs` Line 80:
     ```javascript
     if (receipt.status === "awaitingRoll") add(`Roll ${receipt.formula}...`, ...);
     ```
     Because `receipt.status` is `"complete"`, no Roll button is ever rendered on the chat card.

3. **ActorSheetV2 Features Tab Integration Deficiencies (`ak5e/scripts/medic-sheet.mjs`)**:
   - Lines 316–337 (`renderMedicControls`):
     - Injects `<section class="ak5e-medic-sheet-panel">`.
     - Displays only `<p class="ak5e-medic-summary">Life Support: ...</p>`.
     - CSS class `.ak5e-medic-badge` is NOT present.
     - Spell Save DC and Martial DC are NOT displayed in the Features tab panel.
     - Subclass is NOT displayed in the Features tab panel.
     - Intravenous Line tuning state is NOT displayed in the Features tab panel.
   - Lines 277–290 (`intravenousLine.apply` in `medic-uses.mjs`):
     - Spends 10 Life Support, but sets zero flags on `actor` (`flags.ak5e.medic.tuned` or similar). The tuned state is never persisted on actor state or target document.

4. **Inaccurate Mettle Reversion in `grantMettle.revert` (`ak5e/scripts/medic-uses.mjs`)**:
   - Lines 536–543:
     ```javascript
     async revert(_source, useId, _entry, target) {
       const dying = target.flags?.ak5e?.dying ?? {};
       const before = Number(dying.mettle) || 0;
       await target.update({
         "flags.ak5e.dying.mettle": Math.max(0, before - 6),
         "flags.ak5e.dying.stopTheFlowReceived": false
       });
       return { removed: true };
     }
     ```
     Hardcodes subtracting 6 instead of restoring `applied.before`. If a dying target had 4 Mettle when Stop the Flow was cast, its Mettle was capped at 8 (granting +4). On revert, subtracting 6 leaves it at 2 instead of 4.

5. **Sheet Dialog Action Fallthrough Without Input Prompts (`ak5e/scripts/medic-sheet.mjs`)**:
   - Lines 298–300: Commands `urgentCareCentre` and `inpatientCare` fall through to default execution without prompting for required inputs (`rolledHealing` for Urgent Care Centre, or `healedAmount` / `targetUuid` for Inpatient Care). Both fall back to hardcoded defaults (10 and 30).

---

## 2. Logic Chain

1. *Premise*: WORKFLOW §3.2 requirement 2 mandates automatic GM relay for changes to documents not owned by the acting player.
2. *Observation*: `play-uses.mjs` line 207 guards all relayed applications with `need(PLANS[receipt.command]?.validateTarget?.(source, receipt, entry, target) === true)`.
3. *Observation*: In `medic-uses.mjs`, `MEDIC_PLANS.touchHeal`, `MEDIC_PLANS.resuscitation`, and `MEDIC_PLANS.stopTheFlow` define zero `validateTarget` functions.
4. *Inference*: In any standard game session where an ally is owned by another player and not by the Medic, every GM relay invocation for `touchHeal`, `resuscitation`, and `stopTheFlow` will be rejected by the GM client with `"The recorded change is not one this use can make."`. Thus, the automatic GM relay is completely non-functional for all core Medic target modifications.

5. *Premise*: WORKFLOW §3.2 requirement 5 mandates: "Never auto-roll the player's dice... Post the use to chat (or a dialog) with a roll button that the player clicks."
6. *Observation*: The `play-uses.mjs` engine transitions a receipt to `"awaitingRoll"` and renders chat card roll buttons only when `receipt.formula` is set.
7. *Observation*: `onTheScene`, `mobileHospital`, and `intravenousLine` define a `rolls` property on the plan return object, but omit setting `receipt.formula` inside their `apply()` callbacks.
8. *Inference*: The receipts transition immediately to `"complete"`, preventing any roll buttons from appearing on the chat card. The dice are neither auto-rolled nor rollable from the chat card button, breaking the table play contract.

9. *Premise*: DISPATCH and ORIGINAL_REQUEST.md require a `.ak5e-medic-badge` in the Features tab displaying Life Support, overMax status, DC, subclass, and tuning state.
10. *Observation*: `renderMedicControls` in `medic-sheet.mjs` injects `.ak5e-medic-summary`, displays only Life Support current/max, completely omits DC, subclass, and tuning state, and `intravenousLine` never writes tuning state to `actor.flags`.
11. *Inference*: ActorSheetV2 fails the interface specification for sheet badges and state inspection.

---

## 3. Review Summary & Findings

### Verdict: REQUEST_CHANGES

### Finding 1 [Critical] — GM Relay Failure: Missing `validateTarget` on All Target Plans
- **What**: `validateTarget` is omitted from `touchHeal`, `resuscitation`, and `stopTheFlow`.
- **Where**: `ak5e/scripts/medic-uses.mjs`, Lines 84–125, 172–213, 426–471.
- **Why**: Violates WORKFLOW §3.2 requirement 2 and `DECISIONS.md` Lines 404–405. Whenever an ordinary player runs these abilities on an unowned ally, `relayedTargetChange` on the GM client throws an exception, permanently blocking all healing, mettle, and revivify operations across the network.
- **Suggestion**: Add `validateTarget` to each plan:
  - `touchHeal`: verify `Boolean(target && entry.kind === "heal" && entry.amount === receipt.result?.amount)`
  - `resuscitation`: verify `Boolean(target && entry.kind === "heal" && entry.amount === receipt.result?.healAmount)`
  - `stopTheFlow`: verify `Boolean(target && entry.kind === "grantMettle" && entry.amount === 6)`

### Finding 2 [Major] — Lack of Roll Buttons on Cards for Dice-Rolling Plans
- **What**: `receipt.formula` is never assigned in `onTheScene`, `mobileHospital`, and `intravenousLine`.
- **Where**: `ak5e/scripts/medic-uses.mjs`, Lines 277–290, 394–403, 509–513.
- **Why**: Violates WORKFLOW §3.2 requirement 5. The card is marked `"complete"` immediately without generating interactive roll buttons for document owners.
- **Suggestion**: In `apply(next, receipt)`, explicitly set `receipt.formula`:
  - `onTheScene`: `receipt.formula = dieFormula;`
  - `mobileHospital`: `receipt.formula = healFormula;`
  - `intravenousLine`: If `isUnwilling`, set `receipt.saveAbility = "con"`, `receipt.saveDc = dc`, `receipt.saveTargetUuid = target?.uuid`.

### Finding 3 [Major] — ActorSheetV2 Status Badge Missing Required Elements
- **What**: The Features tab panel lacks the `.ak5e-medic-badge` container and omits Spell Save DC, Martial DC, Subclass, and Intravenous Line tuning state.
- **Where**: `ak5e/scripts/medic-sheet.mjs`, Lines 316–337.
- **Why**: Violates prompt specification R3 / DISPATCH Item 3. Players cannot inspect their core class DC, subclass, or active tuning link directly from the sheet features panel.
- **Suggestion**: Update `renderMedicControls` to append a `.ak5e-medic-badge` section displaying Life Support (with overMax), Spell Save DC, Martial DC, Subclass, and Intravenous Line tuning status.

### Finding 4 [Major] — Intravenous Line Does Not Persist Tuning State
- **What**: `intravenousLine` does not store the tuned target or duration on `actor` or `target`.
- **Where**: `ak5e/scripts/medic-uses.mjs`, Lines 277–290.
- **Why**: Ch. 3 L4880–4884 specifies that the Medic tunes to a creature for 10 minutes. Without persisting this state, the sheet cannot show who is tuned, and the +1d6/+2d6 bonus cannot be verified or applied during subsequent turns.
- **Suggestion**: In `intravenousLine.apply`, persist `flags.ak5e.medic.tuned = { targetUuid: target?.uuid, name: target?.name, expiresAt: Date.now() + 600000 }` and clear it on undo.

### Finding 5 [Minor] — Stop the Flow Undo Revert Hardcodes -6
- **What**: `grantMettle.revert` subtracts 6 from target Mettle instead of reverting to the prior value.
- **Where**: `ak5e/scripts/medic-uses.mjs`, Lines 536–544.
- **Why**: Violates WORKFLOW §3.2 requirement 6 ("The undo receipt restores the exact prior value").
- **Suggestion**: Store `applied` with `before` and `granted` on `flags.ak5e.${appliedFlag}.${appliedKey(source, useId)}` in `apply`, and restore `applied.before` on `revert`.

### Finding 6 [Minor] — Sheet Dialog Action Fallthrough for `urgentCareCentre` and `inpatientCare`
- **What**: Dialog clicks fall through to default execution without prompting for required amounts.
- **Where**: `ak5e/scripts/medic-sheet.mjs`, Lines 298–300.
- **Why**: Ignores actual roll values, forcing fallback defaults of 10 and 30.
- **Suggestion**: Add input prompts in `handleMedicCommand` for `urgentCareCentre` (prompt for rolled healing) and `inpatientCare` (prompt for triggering heal amount and target).

---

## 4. Adversarial Challenge & Stress Tests

### Challenge Summary
- **Overall Risk Assessment**: **HIGH** (multi-client relay completely broken for healing/mettle; dice roll buttons absent; sheet state inspection incomplete).

### Stress Test Results
| Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| GM Relay: Non-owner calls `touchHeal` on party member | GM client validates and commits heal to target actor | Throws `The recorded change is not one this use can make.` | **FAIL** (Finding 1) |
| GM Relay: Non-owner calls `stopTheFlow` on dying ally | GM client validates and commits 6 Mettle to target | Throws `The recorded change is not one this use can make.` | **FAIL** (Finding 1) |
| GM Relay: Non-owner calls `resuscitation` on dead ally | GM client validates and restores HP | Throws `The recorded change is not one this use can make.` | **FAIL** (Finding 1) |
| Table Play: `onTheScene` executed from dialog | Chat card renders clickable roll button for `1d6/2d6 + mod` | Card status marked "complete"; no roll button rendered | **FAIL** (Finding 2) |
| Table Play: `mobileHospital` executed from dialog | Chat card renders clickable roll button for `3d6 + mod` | Card status marked "complete"; no roll button rendered | **FAIL** (Finding 2) |
| Sheet UI: Features tab rendered for Physician | Injects `.ak5e-medic-badge` with DC, subclass, tuning | Injects `.ak5e-medic-summary` with only LS; DC/tuning absent | **FAIL** (Finding 3) |
| Runtime State: Physician tunes creature with Intravenous Line | `flags.ak5e.medic.tuned` stores target UUID and name | No flags set; actor has no record of being tuned | **FAIL** (Finding 4) |
| Reversibility: Target has 4 Mettle, receives Stop the Flow (8 Mettle), then undoes | Mettle restored to exact prior value (4) | Mettle reduced to 8 - 6 = 2 | **FAIL** (Finding 5) |
| Unit Test Regression (`npm run test:medic`) | 33 unit tests pass | 33 passed (tests only covered single-owner fixture) | **PASS** (isolated) |
| Syntax & Schema Validation (`validate-files.mjs`) | Zero syntax or schema errors across 263 files | 263 files valid | **PASS** |

### Integrity Check
- No hardcoded cheat constants, facade classes, or fake verification artifacts detected.
- The root cause is a test fixture gap: unit tests in `medic-uses.test.mjs` used `createTestActor` where `canWrite(target)` returned `true`, completely bypassing `relayedTargetChange` and masking the missing `validateTarget` defect.

---

## 5. Caveats
- No live browser Playwright test session was launched during this review turn, as the defects were definitively reproduced and validated via direct Node execution and source code tracing.

---

## 6. Conclusion
The implementation of the AK5e Medic base class and subclasses represents a strong foundation with accurate pure chassis math, progression structures, and resource pool registration. However, **critical defects exist in table-play integration and WORKFLOW §3.2 compliance**:
1. Automatic GM relay fails for all unowned target operations due to missing `validateTarget`.
2. Dice-rolling features (`onTheScene`, `mobileHospital`, `intravenousLine`) fail to render clickable roll buttons on chat cards.
3. ActorSheetV2 Features-tab status badges omit DC, subclass, and tuning state, and Intravenous Line fails to persist tuning state.

Therefore, the verdict is **REQUEST_CHANGES**.

---

## 7. Verification Method
To independently verify the observations and failure modes in this report:

1. **Verify GM Relay Failure**:
   ```bash
   node -e '
   import { medicUses } from "./ak5e/scripts/medic-uses.mjs";
   import { setupFoundryGlobals, createTestActor } from "./ak5e/test/base-classes-fixture.mjs";
   import { defineMedicPools, setLifeSupport } from "./ak5e/scripts/medic-features.mjs";
   setupFoundryGlobals(); defineMedicPools();
   const medic = createTestActor({ name: "Medic", class: "class-medic", level: 1 });
   medic.flags.ak5e = { medic: { enabled: true, spellcastingAbility: "int" } };
   setLifeSupport(medic, 50, "setup");
   const patient = createTestActor({ name: "Patient", level: 1 });
   patient.system.attributes.hp = { value: 10, max: 30 };
   await medicUses.command(medic, "touchHeal", { confirmed: true, amount: 10, targetUuid: patient.uuid }, "op-th-verify");
   try {
     await medicUses.relayedTargetChange(medic, "apply", { useId: "op-th-verify", targetUuid: patient.uuid });
     console.log("PASS");
   } catch (e) {
     console.error("FAIL:", e.message);
   }
   '
   ```
   *Expected outcome*: Prints `FAIL: The recorded change is not one this use can make.`

2. **Verify Missing Roll Formula on Chat Receipts**:
   ```bash
   node -e '
   import { medicUses } from "./ak5e/scripts/medic-uses.mjs";
   import { setupFoundryGlobals, createTestActor } from "./ak5e/test/base-classes-fixture.mjs";
   import { defineMedicPools, setLifeSupport } from "./ak5e/scripts/medic-features.mjs";
   setupFoundryGlobals(); defineMedicPools();
   const medic = createTestActor({ name: "Medic", class: "class-medic", branch: "subclass-medic-triage", level: 7 });
   medic.flags.ak5e = { medic: { enabled: true, spellcastingAbility: "int" } };
   setLifeSupport(medic, 50, "setup");
   await medicUses.command(medic, "onTheScene", { confirmed: true }, "op-ots-verify");
   const receipt = medicUses.receipt(medic, "op-ots-verify");
   console.log("formula:", receipt.formula, "status:", receipt.status);
   '
   ```
   *Expected outcome*: Prints `formula: undefined status: complete` (proving no roll button will be rendered).

3. **Verify File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome*: 263 files validated.
