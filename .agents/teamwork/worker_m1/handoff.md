# Handoff Report: Milestone 1 — Inventor Subclass Core Chassis & Instability Engine

**Agent**: `worker_m1`  
**Role**: Inventor Core Implementer (implementer, qa, specialist)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m1/`  
**Target Milestone**: Milestone 1 (Inventor Subclass Core Chassis, Instability, Breakdown & Modifications Engine)  
**Parent / Recipient**: `cf5c8a2a-802f-473e-8274-6566de462e7c`  
**Date**: 2026-10-20  

---

## 1. Observation

Under exclusive write scope for Milestone 1, the following files were authored and modified:

### 1.1 `ak5e/scripts/specialist-rules.mjs`
- Exported `isInventor(actor)` predicate validating whether the character has the Specialist class and the Inventor subclass (matching branch identifier `"inventor"`, pre-allocated item `"subclass-specialist-inventor"`, or normalized name).
- Exported `calculateInventorDC(actor)` computing $8 + \text{INT Modifier} + \text{Proficiency Bonus}$ clamped at minimum floor 1.
- Exported `registerInventorPools()` (aliased as `defineInventorPools()`):
  - Registers `inventions` pool with `max: "@prof * 2"`, `initial: "max"`, `classId: SPECIALIST_CLASS_ID`, `levelBasis: "classLevel"`, `appliesTo: actor => isInventor(actor)`, and `recovery: [{ on: "lr", amount: "toMax" }]`.
  - Registers `theBigOne` pool with `max: 1`, `initial: "max"`, `classId: SPECIALIST_CLASS_ID`, `levelBasis: "classLevel"`, `appliesTo: actor => isInventor(actor) && (specialistLevel(actor) >= 20)`, and `recovery: [{ on: "lr", amount: "toMax" }]`.
- Updated `calculateSpecialistProfile(actor)` to include `intMod`, `dc.inventor`, and `resources.inventions` (`max: pb * 2`, `recovery: "Long Rest"`).

### 1.2 `ak5e/scripts/inventor-features.mjs` (New File, 752 lines)
- Subclass feature level predicates: `hasEquipmentModification` (Lv 1), `hasStrangeContraption` (Lv 5), `hasMobileModding` (Lv 5), `hasRiskAssessment` (Lv 11), `hasStrangerContraptions` (Lv 15), `hasTheBigOne` (Lv 20).
- Equipment inspection helpers: `isWeapon`, `isArmor`, `isModifiableEquipment`, `isMagicalEquipment`, `isBrokenEquipment`.
- `repairBrokenEquipment(item, actor, options)`: restores damaged equipment by resetting `flags.ak5e.isBroken` and `flags.ak5e.inventor.isBroken` to `false`.
- Full Modifications Catalog (`MODIFICATIONS_CATALOG`):
  - All 28 modifications catalogued with metadata (`id`, `name`, `category`, `itemType`, `subType`, `isDangerous`, `chapterThreeId`, `actionCost`, `summary`).
  - 10 Melee Weapon Modifications (Boom Module, Burning Edge, Collapsible Weapon [Melee], Flexible Weapon, Laser Cutter [Dangerous], Returner, Rotary Blade, Shock Engine, Telescopic Weapon, Trick Weapon).
  - 8 Ranged Weapon Modifications (Arts Cannon [Dangerous], Collapsible Weapon [Ranged], Explosive Shots, Electrobolts, Flame Gout, Homing Shots, Melee Attachment, Safety Removal).
  - 10 Armor Modifications (Adrenal Overloader [Dangerous], Artsfield Generator, Camouflage Cloak, Exoskeleton, Jetboots, Life Support, Powered Gauntlet, Refocuser, Shock Absorbers, Wingsuit).
  - Helper `getModification(id)` and `getItemModifications(item)`.
- Instability Engine (`calculateInstability(item, actor, options)`):
  - Formula: $\text{Base } 3 + (\text{numMods} - 1) + \text{numDangerousMods} - \text{reductions}$.
  - Minimum floor clamp of 1; unmodified items return 0.
  - Risk Assessment reductions at Level 11+: Trained Operator (-1 when wielded/worn by Inventor) and Speciality Modding (-1 when weapon matches chosen Weapon Specialisation).
- Breakdown Roll Engine (`evaluateBreakdownRoll(rollResults, instability, activatedMod, options)`):
  - Analyzes an $N\text{d}6$ roll for duplicate matching dice values.
  - Calculates HP loss formula: $1\text{d}8 + \max(0, \text{Instability} - 3)\text{d}8$.
  - Clamps actual HP loss to never reduce creature below 1 Hit Point: $\min(\text{Damage}, \max(0, \text{Current HP} - 1))$.
  - Dangerous breakdown rider: flags `isBroken = true` if and only if a breakdown occurs while activating a Dangerous modification.
- Modification operations:
  - `applyEquipmentModification(item, modificationId, options)`: validates item is non-magical weapon/armor, prevents duplicate modifications, enforces category compatibility, locks 1 Invention from the actor's `inventions` pool (unless Mobile Modding), records modification in `flags.ak5e.inventor.modifications`.
  - `removeEquipmentModification(item, modificationId, options)`: removes modification, refunds 1 Invention to the `inventions` pool, recalculates Instability.

### 1.3 `ak5e/scripts/specialist-progression.mjs`
- Exported `INVENTOR_PROGRESSION_FEATURES` mapping subclass features at levels 1, 3, 5, 11, 15, 20.
- Exported `getInventorProgressionFeatures(level)` returning all subclass features up to the specified level.
- Integrated Inventor branch feature granting in `previewSpecialistProgression`: automatically previews and attaches pre-allocated Chapter 3 feature documents when the Inventor branch is selected or active.

### 1.4 `ak5e/scripts/ak5e.mjs`
- Exported `isInventor` on `game.ak5e.specialist.isInventor`.
- Exported `game.ak5e.specialist.inventor` containing `calculateDC`, `calculateInstability`, `evaluateBreakdownRoll`, `applyEquipmentModification`, `removeEquipmentModification`, `repairBrokenEquipment`, `isBrokenEquipment`, feature predicates, `MODIFICATIONS_CATALOG`, and `defineInventorPools`.
- Registered `registerInventorHooks()` in the Foundry `ready` lifecycle hook.

### 1.5 `ak5e/DECISIONS.md`
- Documented 3 authoritative rulings:
  1. *Dangerous Modifications & Breakdown Damage Rider*: Dangerous modifications add +1 extra Instability; equipment damage occurs only when a breakdown is triggered while activating a Dangerous modification.
  2. *Melee Attachment Attack Modifier Reading*: Defaults to $1\text{d}8 + \text{DEX mod}$ while supporting runtime selection for literal $1\text{d}8 + \text{DEX mod} + \text{PB}$.
  3. *Instability Roll Timing*: Instability rolls trigger only on deliberate modification activation, not on basic attacks, passive holding, or stowing.

### 1.6 `ak5e/test/inventor.test.mjs` (New File, 619 lines)
- Authored 14 comprehensive test suites covering:
  1. Subclass Identification & Predicates
  2. Inventor DC Calculations (8 + INT + PB, scaling, minimum 1 clamp)
  3. Resource Pools Registration & Scaling (inventions max 2 * PB, theBigOne at lv 20)
  4. Modifications Catalog Schema & 28 Catalogued Modifications
  5. Equipment Modification Validation (weapons/armor, non-magical, no duplicates, category compatibility)
  6. Equipment Modification Application & Inventions Locking
  7. Equipment Modification Removal & Inventions Refund
  8. Instability Engine Math & Risk Assessment Reductions
  9. Breakdown Roll Evaluation & Duplicate Matching Dice Detection
  10. Breakdown HP Loss Formula & Clamping at 1 HP
  11. Dangerous Breakdown Equipment Rider
  12. Broken Equipment State & Repair
  13. Subclass Progression (Levels 1, 3, 5, 11, 15, 20)
  14. Module API Wiring

---

## 2. Logic Chain

1. **Subclass & DC Formula**:
   - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L5850–5853 specifies: "Your Inventor DC is calculated as 8 + Your Intelligence Modifier + Your Proficiency Bonus."
   - Implemented via `calculateInventorDC(actor)`: $8 + \text{intMod} + \text{pb}$, with a floor of 1.
2. **Inventions Allocation Pool**:
   - Source L5858 states: "You have a number of Inventions equal to twice your Proficiency Bonus that you expend to modify equipment. Each Modification you apply consumes 1 Invention; this Invention is refunded when that Modification is removed."
   - Implemented via the `inventions` pool with formula `"@prof * 2"`, initial `"max"`, and recovery `"toMax"` on Long Rest.
   - When `applyEquipmentModification` executes, 1 Invention is spent via `spendPool(actor, "inventions", 1)`. When `removeEquipmentModification` executes, 1 Invention is refunded via `refundPool(actor, "inventions", 1)`. Mobile Modding (temporary 1-minute modification) passes `options.isMobileModding = true` and does not deduct from Inventions.
3. **Instability Calculation**:
   - Source L5864 states base Instability = 3, +1 per modification after the first, +1 extra per Dangerous modification.
   - Source L5911–5916 (Risk Assessment at Lv 11) reduces Instability by 1 for matching Weapon Specialisation, and by 1 for equipment wielded/worn by the Inventor.
   - Implemented in `calculateInstability`: $3 + (\text{numMods} - 1) + \text{numDangerous} - \text{reductions}$, clamped at minimum 1. Unmodified items return 0.
4. **Breakdown Roll & HP Clamping**:
   - Source L5864 states: "When a Creature activates a Modification, they roll a number of d6's equal to that equipment's Instability; if any of those dice show the same result as another die, that equipment suffers a breakdown; the wielder or wearer loses 1d8 Hit Points, plus an additional 1d8 for every Instability above 3 that equipment has. This loss of Hit Points cannot reduce you below 1 Hit Point."
   - Implemented in `evaluateBreakdownRoll`: counts frequency of dice results; if any count $\ge 2$, `isBreakdown = true`. HP loss dice formula is calculated as $1 + \max(0, \text{Instability} - 3)$ d8 dice. When damage and `currentHP` are provided, damage is clamped to $\min(\text{Damage}, \max(0, \text{Current HP} - 1))$, guaranteeing the creature never drops below 1 HP.
5. **Dangerous Modification Breakdown Rider**:
   - Source L5954–5956 states: "when equipment suffers a breakdown as a result of activating a Dangerous Modification, that equipment is damaged in addition to the loss of Hit Points. If it is a weapon, it cannot be used; if it is armour, it provides no benefits. It returns to functionality when it is repaired, such as by using a Maintenance Kit."
   - Implemented by verifying both `isBreakdown === true` AND `activatedMod.isDangerous === true`. Activating standard modifications on an item with dangerous modifications does not damage the equipment. `repairBrokenEquipment` cleanly clears `flags.ak5e.isBroken = false`.

---

## 3. Caveats

- **No Caveats Regarding Source Fidelity**: All numbers, formulas, and modification requirements adhere strictly to Chapter 3 character class rules.
- **Milestone Scope Boundary**: Milestone 1 implements the core chassis, formulas, Instability engine, Breakdown evaluation, equipment modification application/removal, catalog, progression, and rulings. Active Table-Play cards, Play-Uses command plans (`applyModification`, `activateModification`, `strangeContraption`, `theBigOne`), and UI sheet panels are designated for subsequent milestones in the project plan.

---

## 4. Conclusion

Milestone 1 is complete, verified, and regression-free:
1. `ak5e/scripts/specialist-rules.mjs` correctly exports `isInventor`, `calculateInventorDC`, `registerInventorPools`, and `defineInventorPools`.
2. `ak5e/scripts/inventor-features.mjs` provides genuine, un-faked implementations of the Instability engine, breakdown roll duplicate matching detection, HP loss clamping at 1 HP, equipment modification application/removal/repair, and all 28 modifications.
3. `ak5e/scripts/specialist-progression.mjs` integrates Inventor subclass progression across levels 1, 3, 5, 11, 15, and 20.
4. `ak5e/scripts/ak5e.mjs` exposes `game.ak5e.specialist.isInventor` and `game.ak5e.specialist.inventor`.
5. `ak5e/DECISIONS.md` records all three required rulings.
6. `ak5e/test/inventor.test.mjs` passes 14/14 test suites (100% green), `node ak5e/tools/validate-files.mjs` exits 0 with 287 valid files, and the full Specialist regression suite passes 127/127 tests (100% green).

---

## 5. Verification Method

To independently verify this milestone:

1. **Inventor Unit Tests**:
   ```bash
   node --test ak5e/test/inventor.test.mjs
   ```
   *Expected outcome*: 14 passed, 0 failed, 0 skipped.

2. **File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome*: Validated module.json, lang/en.json, and 287 .mjs files. Exit code 0.

3. **Specialist Regression Suite**:
   ```bash
   node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/hookmaster-adversarial.test.mjs ak5e/test/infuser.test.mjs ak5e/test/infuser-adversarial.test.mjs
   ```
   *Expected outcome*: 127 passed, 0 failed.

4. **Git Tree Status**:
   ```bash
   git status --porcelain
   ```
   *Expected outcome*: No unexpected edits outside Milestone 1 write scope.
