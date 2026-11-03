# Infuser Specialist Subclass Architectural & Test Blueprint (Milestone 4)

## 1. Observation

### 1.1 Canonical Source Text Quotations (`AK5e_1.3.1_Foundry_Source/`)
1. **Infuser DC** (`03_chapter_3_character_classes.txt`, lines 5688–5690):
   > "Some Infuser Features do not use your Martial DC, but instead an Infuser DC. Your Infuser DC is calculated as 20 - Your Intelligence Modifier - Your Proficiency Bonus."
2. **Principle of Double Effect** (`03_chapter_3_character_classes.txt`, lines 5692–5700):
   > "**Additional Tool Proficiencies.** You are Proficient with the Pharmacology Kit.
   > **Alchemical Infusions.** As a Bonus Action, you can apply one of your chemical Infusions to a willing Creature you can see within 5 feet of you that is not a Construct or Undead for 1 minute. Infusions available for you to apply are in the Infusions table below. A Creature can only have one Infusion applied to them at a time; applying a second Infusion removes the effect of any other Infusions on that Creature. You may use this Feature a number of times equal to twice your Proficiency Bonus, and recover all expended uses when you complete a Long Rest.
   > To gain a benefit from an Infusion, that Creature must Leverage it. Each Infusion describes the scenarios under which it can be Leveraged. When a Creature chooses to Leverage an Infusion that has been applied to it by you, it must immediately make a Constitution Saving Throw against your Infuser DC. On a successful Save, they gain the benefit of that Infusion; on a failed Save, they gain the benefit of that Infusion, but they are additionally Dazed until the beginning of their next Turn, and cannot Leverage any Infusions while they have this Condition. An Infusion is not consumed when it is Leveraged."
3. **New Concoctions** (`03_chapter_3_character_classes.txt`, lines 5705–5726):
   > "When you use the Toxicology Proficient Use of the Pharmacology Kit, you can create two additional types of Toxin, detailed below. Both have a Weight of 1 lb. and a Cost of 140 LMD, but cannot be purchased.
   > **Neurological Inhibitor:** As an Action, you can apply this to a Weapon you are carrying, or poison food/drink within 5ft of you... When applied to a Weapon, the effect lasts for ten minutes. The first time each Turn you hit a Creature with that Weapon, that Creature must pass a DC15 Constitution Saving Throw or be driven Berserk until the end of their next Turn. While Berserk, they regard all other Creatures as actively hostile, and must attack the Creature closest to themselves...
   > **Bungarotoxin:** As an Action, you can apply this to a Weapon you are carrying, or poison food/drink within 5ft of you... When applied to a Weapon, the effect lasts for ten minutes or until after you have hit a Creature with the affected weapon. When you hit a Creature with that Weapon, that Creature must make a DC15 Constitution Saving Throw. On a failed Save, they take 2d10 Poison Damage and are Paralyzed. On a successful Save, they take 2d10 Poison Damage and are not Paralyzed. A Creature Paralyzed in this way can reattempt this Saving Throw at the end of each of their Turns, ending the effect on a success..."
4. **Double-Blind Trial & Prowess Triggers** (`03_chapter_3_character_classes.txt`, lines 5732–5745):
   > "As a Bonus Action while you are wielding a Weapon that does not have a Toxin applied to it, and have access to a Pharmacology Kit, you can expend 1 Prowess and 1 use of your Alchemical Infusions Feature to roll 1d6 and apply the corresponding Toxin to that Weapon; this does not require you to physically possess the Toxin.
   > 1: Neurological Inhibitor, 2: Necrotoxin, 3: Haemotoxin, 4: Cytotoxin, 5: Neurotoxin, 6: Bungarotoxin.
   > **Gaining Prowess as an Infuser.** As an Infuser, you gain 1 Prowess when a Creature that either has the Poisoned Condition, or is affected by a Toxin created by you, is reduced to 0 Hit Points. Additionally, you gain 1 Prowess when the effect of one of your Infusions causes a Creature to succeed on an Attack Roll, Skill Check, or Saving Throw it would otherwise have failed; you can only gain Prowess in this way once per Round."
5. **Stimpack** (`03_chapter_3_character_classes.txt`, lines 5747–5754):
   > "**Delivery Service.** The range at which you can apply Infusions is increased to 30 feet.
   > **Questionable Rejuvenation.** When you apply an Infusion to a Creature, and when a Creature succeeds on a Saving Throw against one of your Infusions, that Creature gains 1d10 Temporary Hit Points; if that Infusion is Procoagulant, these Temporary Hit Points are instead added to the Temporary Hit Points granted by that Infusion."
6. **Excessive Dosing** (`03_chapter_3_character_classes.txt`, lines 5758–5764):
   > "**Succumb.** The DC of your Toxins is increased by your Proficiency Bonus.
   > **Toxic Shock.** Creatures that fail a Saving Throw against your Toxins are now additionally Poisoned for the same duration as that Toxin's Conditions. If the Toxin does not apply a Condition upon failing the Saving Throw (such as Haemotoxin), they are instead Poisoned until the end of their next Turn."
7. **To Defy Science** (`03_chapter_3_character_classes.txt`, lines 5765–5770):
   > "As an Action, you can choose a Creature you can see within 30 feet; that Creature cannot lose Hit Points for the next minute, as if they were under the effect of Invulnerability. Once you have used this Feature, you may not do so again until you have completed a Long Rest."
8. **The 8 Alchemical Infusions** (`03_chapter_3_character_classes.txt`, lines 5782–5823):
   - **Adrenaline Trigger**: Leverage: Reaction when Creature fails STR Skill Check, Saving Throw, or misses Melee Attack. Effect: Creature rolls 1d6 and adds result to total, possibly changing failure to success.
   - **Flight Reflex Stimulant**: Leverage: Reaction when Creature fails any Saving Throw. Effect: Creature adds Infuser's Intelligence Bonus to save result, possibly changing failure to success.
   - **Focus Heightener**: Leverage: Reaction when Creature fails DEX Skill Check, Saving Throw, or misses Ranged Attack. Effect: Creature rolls 1d6 and adds result to total, possibly changing failure to success.
   - **Hesitation Suppressor**: Leverage: Reaction when Creature forces a hostile Creature to make a Saving Throw. Effect: Creature rolls 1d4; DC of that Saving Throw is increased by rolled amount.
   - **Muscle Strengthener**: Leverage: Reaction when Creature hits with Melee Attack. Effect: Melee attack damage increased by Infuser's Intelligence Bonus.
   - **Procoagulant**: Leverage: Bonus Action. Effect: Creature rolls one Hit Die (not expended) + CON mod as Temporary Hit Points. Removes Bleeding condition.
   - **Respiration Stimulant**: Leverage: Bonus Action. Effect: Creature's Speed increased by 10 feet until end of turn.
   - **Sensation Nulling**: Leverage: Reaction when Creature takes Damage. Effect: Creature rolls 1d6; gains Damage Reduction (DR) against all damage equal to result until end of turn.

### 1.2 Decision Log Observation (`ak5e/DECISIONS.md`)
- Line 465: `| Infuser DC | C3:5689 prints “20 - Your Intelligence Modifier - Your Proficiency Bonus”. | **UNRESOLVED.** Preserve subtraction exactly; do not replace it with a conventional D&D5e DC. |`

### 1.3 Critical Rule Discrepancy Observation (Dispatch Prompt vs Chapter 3 Source Text)
The dispatch message presented an alternative / draft text for the 8 infusions that ascribed passive benefits and completely different leverage mechanics (e.g. passive Advantage on Initiative, passive speed, reaction attacks, etc.).
Direct inspection of `03_chapter_3_character_classes.txt` L5697–5700 and L5782–5823 proves conclusively that:
- Infusions have **zero passive effects**. An infusion is merely applied to a creature (lasts 1 minute).
- Benefits occur **only upon Leverage**, which requires an immediate CON save against the Infuser DC.
- The source text numbers and triggers in L5782–5823 are the authoritative mechanics.

### 1.4 Codebase Context & Existing Infrastructure
1. `ak5e/scripts/specialist-rules.mjs` (L317–331):
   `isInfuser(actor)` is already defined, checking for subclass branch `"infusion"` and chapter three id `"subclass-specialist-infuser"`.
2. `ak5e/scripts/specialist-features.mjs`:
   Registers prowess pool and core recovery hooks.
3. `ak5e/scripts/specialist-uses.mjs`:
   Wires `specialistUses` instance via `createPlayUses({ ns: "specialistUses" })`. Requires `INFUSER_PLANS` integration and `validateTarget` definitions.
4. `ak5e/scripts/specialist-sheet.mjs` (L210–218):
   Currently contains an Infuser placeholder: `<p><em>Infuser subclass capabilities will be active once milestone features are loaded.</em></p>`.
5. `ak5e/scripts/ak5e.mjs` (L326–399, L529–533):
   Exposes base Specialist, Executor, and Hookmaster on `game.ak5e.specialist`; currently lacks `specialist.infuser` exports and `registerInfuserHooks()` call.
6. Gate History (`orchestrator_8/GATE_STATUS.md`):
   M2 and M3 both failed initial review due to:
   - Dummy assertions like `assert.ok(true)`.
   - Absence of realistic `Hooks.callAll` dispatch tests.
   - Failure to test hook listener count invariance across repeated `register*Hooks()` calls.
   - Missing target kinds or unhandled `validateTarget` paths.

---

## 2. Logic Chain

### 2.1 Infuser DC Calculation & State Model
- **Observation**: C3:5689 prints `20 - INT - PB`; DECISIONS.md L465 mandates preserving subtraction exactly.
- **Deduction**: Because the target making the saving throw is an ally seeking to avoid the Dazed penalty and Leverage Lockout, a higher INT modifier and higher PB from a more skilled chemist reduces the DC, making it easier for the ally to pass the save.
- **Architectural Design**:
  - `calculateInfuserDC(actor, { useStandardFormula = false } = {})`:
    - Base calculation: `20 - intMod - pb`.
    - If `useStandardFormula` is true (or actor ruling flag `specialist.rulings.infuserDcFormula === "standard"`), calculate `8 + intMod + pb`.
    - Floor clamp: `Math.max(1, dc)` to prevent non-positive DC.
- **Active Infusion Tracking**:
  - Target Actor Flag: `flags.ak5e.infuser.activeInfusion = { type, name, infuserUuid, infuserId, infuserName, dc, appliedAt, expiresAt }`.
  - Infuser Actor Flag: `flags.ak5e.infuser.activeInfusions = { [targetUuid]: { type, name, appliedAt, expiresAt } }`.
  - Leverage Lockout Flag: `flags.ak5e.infuser.leverageLockout = true` (clears on `turnStart` or when Dazed condition ends).

### 2.2 Table-Play Plans & Agency (`ak5e/scripts/specialist-uses.mjs` & WORKFLOW §3.2)
All active features must follow WORKFLOW §3.2:
1. `applyInfusion(actor, state, data)`:
   - **Action**: Bonus Action.
   - **Cost**: 1 use of `alchemicalInfusions`.
   - **Prerequisites & Warnings**:
     - Specialist enabled, Infuser subclass verified.
     - Target must be willing creature within range (5 ft, or 30 ft at level 11).
     - Target must NOT be Construct or Undead (`target.system?.traits?.creatureType !== "construct" && target.system?.traits?.creatureType !== "undead"`).
     - Resource shortfall: if `alchemicalInfusions` < 1, warn with "Use anyway", clamped at 0.
   - **Execution**:
     - Overwrites any prior infusion on target (releasing/replacing it).
     - At Level 11+ (Stimpack Questionable Rejuvenation): Target gains 1d10 Temporary HP (interactive roll button on chat card, not auto-rolled!).
     - Receipt logs: resource spend, target UUID, prior infusion state, temp HP state.
   - **Target Relay**: `applyInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
2. `leverageInfusion(actor, state, data)`:
   - **Action**: Reaction or Bonus Action (as dictated by the infusion).
   - **Prerequisites & Warnings**:
     - Target has an active infusion.
     - Leverage Lockout / Dazed check: If target has `leverageLockout` or `dazed`, warn that target cannot leverage infusions while Dazed.
     - Reaction check: If reaction infusion, verify reaction is available.
   - **Execution**:
     - Interactive CON save button vs Infuser DC.
     - On Save Success: Benefit applies. If Level 11+ Stimpack active, target also gains 1d10 Temp HP (additive with Procoagulant!).
     - On Save Failure: Benefit applies, BUT target gains `dazed` status condition until beginning of their next turn and `leverageLockout = true`.
     - Specific Infusion Benefits:
       - `adrenalineTrigger`: 1d6 roll button added to failed STR check/save/attack.
       - `flightReflexStimulant`: adds Infuser INT bonus to failed save.
       - `focusHeightener`: 1d6 roll button added to failed DEX check/save/ranged attack.
       - `hesitationSuppressor`: 1d4 roll button to boost forced save DC.
       - `muscleStrengthener`: adds Infuser INT bonus to melee attack damage.
       - `procoagulant`: rolls target's Hit Die + CON mod Temp HP, removes Bleeding condition. (If Lv 11+ Stimpack, adds 1d10 to this Temp HP).
       - `respirationStimulant`: +10 ft speed until end of turn.
       - `sensationNulling`: 1d6 roll button for DR against all damage until end of turn.
   - **Target Relay**: `leverageInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
3. `doubleBlindTrial(actor, state, data)`:
   - **Action**: Bonus Action (Level 5+).
   - **Cost**: 1 Prowess AND 1 use of `alchemicalInfusions`.
   - **Prerequisites & Warnings**:
     - Level 5+ warning.
     - Access to Pharmacology Kit warning.
     - Wielding weapon without a toxin warning.
     - Shortfall warnings if Prowess < 1 or Infusions < 1.
   - **Execution**:
     - Interactive 1d6 roll button on chat card ("Roll 1d6 Toxin").
     - Maps to: 1=Neurological Inhibitor, 2=Necrotoxin, 3=Haemotoxin, 4=Cytotoxin, 5=Neurotoxin, 6=Bungarotoxin.
     - Applies toxin to weapon for 10 minutes (`flags.ak5e.appliedToxin`).
     - Toxin DC is 15 (or `15 + PB` if Level 15+ Excessive Dosing).
   - **Target Relay**: `doubleBlindTrial.validateTarget = () => false;` (self-weapon modification only).
4. `toDefyScience(actor, state, data)`:
   - **Action**: Action (Level 20).
   - **Cost**: 1 use of `toDefyScience` (1/Long Rest).
   - **Prerequisites & Warnings**: Level 20 warning; target within 30 ft; shortfall warning.
   - **Execution**: Target gains `flags.ak5e.infuser.invulnerable = true` for 1 minute (cannot lose HP; all damage taken reduced to 0).
   - **Target Relay**: `toDefyScience.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
5. `clearInfusion(actor, state, data)`:
   - Clears active infusion from target and infuser tracking.
   - `clearInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`

### 2.3 Encounter-Window Undo Reversibility
Every operation stores an undo receipt under `flags.ak5e.specialistUses.undo`:
- `applyInfusion`: Reverts `alchemicalInfusions` spend, restores prior infusion on target (or clears it), reverts any Temp HP granted by Questionable Rejuvenation.
- `leverageInfusion`: Reverts Dazed condition and Leverage Lockout on target, restores spent reactions.
- `doubleBlindTrial`: Refunds 1 Prowess, refunds 1 Alchemical Infusion, removes `appliedToxin` flag from weapon.
- `toDefyScience`: Refunds 1 use of `toDefyScience`, removes `invulnerable` flag from target.

### 2.4 Hook Registration & Invariance
- `registerInfuserHooks()` must check `if (hooksInstalled === globalThis.Hooks) return;`.
- Subscribes to:
  1. `dnd5e.preRollDamageV2`: checks for Muscle Strengthener bonus (+INT) or Cytotoxin bonus (+1d6 Poison).
  2. `dnd5e.preApplyDamage`: checks for To Defy Science (`invulnerable`) to prevent all HP loss; checks for Sensation Nulling DR.
  3. `onAk5eEvent("kill")`: triggers +1 Prowess gain when a Poisoned or Toxined creature drops to 0 HP.
  4. `onAk5eEvent("turnStart")`: resets per-turn/per-round Infuser flags (`leverageLockout`, `prowessGainedFromInfusionThisRound`).
- Multiple invocations of `registerInfuserHooks()` must leave Hook listener counts completely invariant.

---

## 3. Caveats

1. **Prompt Discrepancy vs Source Authority**:
   - The dispatch prompt included alternative/draft mechanics for Alchemical Infusions with passive bonuses.
   - Per WORKFLOW §2 and AGENTS.md, `AK5e_1.3.1_Foundry_Source/` is the sole rules authority.
   - The implementation MUST implement the canonical Chapter 3 rules (lines 5782–5823). To accommodate GM preferences without breaking source fidelity, an optional ruling toggle (`specialist.rulings.infuserDcFormula`) can support standard DC `8 + INT + PB`, but defaults to `20 - INT - PB`.
2. **Hit Dice Determination for Procoagulant**:
   - Procoagulant allows the creature to roll "one of their Hit Dice (this does not expend that Hit Dice)".
   - In D&D5e, targets may have various class HD (e.g. 1d6, 1d8, 1d10, 1d12). The helper must inspect `target.system.attributes.hd` or fallback to `1d8` if untyped.
3. **No Auto-Rolled Dice**:
   - Procoagulant, Sensation Nulling, Adrenaline Trigger, Focus Heightener, Hesitation Suppressor, Double-Blind Trial, and Stimpack Temp HP MUST produce chat cards with interactive roll buttons rather than evaluating dice programmatically during plan execution.

---

## 4. Conclusion & Architecture Blueprint

### 4.1 File: `ak5e/scripts/infuser-features.mjs`
```javascript
/**
 * Infuser Specialist Subclass features (Ch. 3 L5688–5823 & DECISIONS.md L465).
 * Pure and functional logic, state inspection, resource pools, and mechanical hooks.
 * Supports Infuser DC (20 - INT - PB), Principle of Double Effect, 8 Alchemical Infusions,
 * Leverage CON save workflow & Lockout, New Concoctions, Double-Blind Trial,
 * Infuser Prowess gain triggers, Stimpack, Excessive Dosing, and To Defy Science.
 */
```
Key exports:
- `INFUSER_SUBCLASS_ID = "subclass-specialist-infuser"`
- `INFUSIONS`: Frozen record of all 8 infusions (`name`, `trigger`, `actionType`, `formula`, `effect`).
- `DOUBLE_BLIND_TABLE`: Frozen 1d6 mapping of Toxins.
- `isInfuser(actor)`
- `calculateInfuserDC(actor, { useStandardFormula = false } = {})`
- `calculateInfusionRange(actor)`
- `getActiveInfusion(target)`
- `hasPrincipleOfDoubleEffect(actor)`
- `hasNewConcoctions(actor)`
- `hasDoubleBlindTrial(actor)`
- `hasStimpack(actor)`
- `hasExcessiveDosing(actor)`
- `hasToDefyScience(actor)`
- `getToxinDC(actor, baseDC = 15)`
- `defineInfuserPools()`: registers `alchemicalInfusions` (`max: "2 * @prof"`, recovery LR) and `toDefyScience` (`max: 1`, recovery LR).
- `registerInfuserHooks()`: registers `preRollDamageV2`, `preApplyDamage`, and `onAk5eEvent` handlers with idempotency guard.

### 4.2 File: `ak5e/scripts/specialist-uses.mjs`
Export and register `INFUSER_PLANS`:
- `applyInfusion(actor, state, data)`
- `leverageInfusion(actor, state, data)`
- `doubleBlindTrial(actor, state, data)`
- `toDefyScience(actor, state, data)`
- `clearInfusion(actor, state, data)`
Target validators:
- `applyInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
- `leverageInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
- `clearInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
- `toDefyScience.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
- `doubleBlindTrial.validateTarget = () => false;`
Register readings:
- `infuserDcReading`: choices `inverted` (`20 - INT - PB`) and `standard` (`8 + INT + PB`).

### 4.3 File: `ak5e/scripts/specialist-sheet.mjs`
Replace line 210 placeholder with active Infuser action buttons in `openSpecialistControls`:
- "Apply Alchemical Infusion (Bonus Action)"
- "Leverage Active Infusion"
- "Clear Active Infusion"
- If Level >= 5: "Double-Blind Trial (BA, 1 Prowess + 1 Infusion -> 1d6 Toxin)"
- If Level >= 20: "To Defy Science (Action, 1/LR Invulnerability)"
And display Infuser DC badge and available Infusion uses count.

### 4.4 File: `ak5e/scripts/ak5e.mjs`
- Export `game.ak5e.specialist.infuser`:
  ```javascript
  infuser: Object.freeze({
    calculateDC: calculateInfuserDC,
    getActiveInfusion,
    calculateRange: calculateInfusionRange,
    hasPrincipleOfDoubleEffect,
    hasNewConcoctions,
    hasDoubleBlindTrial,
    hasStimpack,
    hasExcessiveDosing,
    hasToDefyScience,
    getToxinDC,
    INFUSIONS,
    DOUBLE_BLIND_TABLE
  })
  ```
- Invoke `registerInfuserHooks()` in `ready` hook.

---

## 5. Verification Method

### 5.1 Test Suite Structure: `ak5e/test/infuser.test.mjs`
Author 15 exhaustive test areas covering all mechanics without any dummy assertions:

| Area | Description | Verification Target |
|---|---|---|
| **Area 1** | Infuser Identification & Subclass Predicates | `isInfuser`, `specialistBranch === "infusion"`, level-based feature predicates |
| **Area 2** | Infuser DC Calculations | `20 - INT - PB` math, scaling across levels 1, 5, 20; GM toggle `8 + INT + PB`; minimum floor clamp |
| **Area 3** | Principle of Double Effect | Pharmacology Kit proficiency in profile, `alchemicalInfusions` pool cap (`2 * PB`) & LR recovery, 5 ft vs 30 ft range |
| **Area 4** | Construct & Undead Immunity | Target validation correctly rejects / warns when targeting Construct or Undead |
| **Area 5** | Max 1 Active Infusion per Creature | Applying a second infusion cleanly replaces the previous infusion |
| **Area 6** | All 8 Alchemical Infusions | Complete verification of all 8 infusion definitions, triggers, formulas, and actions |
| **Area 7** | Leverage Workflow & Lockout | CON save vs Infuser DC; success applies benefit without Dazed; failure applies benefit + Dazed + Leverage Lockout |
| **Area 8** | Level 5: New Concoctions | Neurological Inhibitor (Berserk on hit/food) & Bungarotoxin (Paralyzed + 2d10 Poison damage) |
| **Area 9** | Level 5: Double-Blind Trial | BA 1 Prowess + 1 Infusion -> 1d6 interactive roll -> applies toxin to weapon for 10 min |
| **Area 10** | Infuser Prowess Gain Triggers | Poisoned/Toxined creature drops to 0 HP -> +1 Prowess; Infusion turns failure into success -> +1 Prowess (1/round limit) |
| **Area 11** | Level 11: Stimpack & Rejuvenation | 30 ft range; Questionable Rejuvenation 1d10 Temp HP on apply and save success; additive with Procoagulant |
| **Area 12** | Level 15: Excessive Dosing | Succumb increases Toxin DC by PB (`15 + PB`); Toxic Shock rider inflicts Poisoned condition on failed save |
| **Area 13** | Level 20: To Defy Science | 1/LR Action within 30 ft; 1-min Invulnerability effect prevents all HP loss |
| **Area 14** | Reversibility & Encounter-Window Undo | Complete undo test for `applyInfusion`, `leverageInfusion`, `doubleBlindTrial`, `toDefyScience` |
| **Area 15** | Hook Registration Idempotency & GM Relay | Hook listener count invariance assertions on re-registration; `validateTarget` assertions; `Hooks.callAll` dispatch tests |

### 5.2 Verification Commands
```bash
# 1. Run all Infuser unit tests
node --test ak5e/test/infuser.test.mjs

# 2. Run full Specialist regression suite
node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-uses.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs

# 3. Static file syntax and structure validation
node ak5e/tools/validate-files.mjs

# 4. Verify generated content consistency
node ak5e/tools/verify-generated-content.mjs
```

### 5.3 Invalidation Conditions
- Any dummy assertions (e.g. `assert.ok(true)`) in unit tests.
- Failure of Hook listener counts to remain invariant when `registerInfuserHooks()` is called multiple times.
- Auto-rolling dice for Temp HP, Damage Reduction, save DC adjustments, or Double-Blind Trial instead of rendering interactive roll buttons.
- Overwriting or failing to preserve the exact `20 - INT - PB` formula as default.
