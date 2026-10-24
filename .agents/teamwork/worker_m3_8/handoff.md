# Handoff Report — Milestone 3: Hookmaster Specialist Subclass

## 1. Observation
- **Rules Authority**: `AK5e_1.3.1_Foundry_Source/` Chapter 3, lines 5585–5679 covers the Hookmaster Specialist Subclass:
  - Line 5585–5600: Hook conversion requires a Melee Weapon dealing Slashing or Piercing damage that does not possess the Two-Handed property. Converts into a Hook gaining Two-Handed (`two`) and Thrown (`thr`, 30/- ft at level 1–14, 50/- ft at level 15+), returns upon attack, and uses Strength modifier instead of Dexterity modifier for ranged attack and damage rolls. First conversion is free as starting subclass equipment; subsequent conversions cost 200 LMD and take 1 hour. Only Hookmasters have proficiency.
  - Line 5605–5625: Big Boot (Level 5): 10 ft Unarmed push on hit against creatures no more than one size larger; forced movement doubled to 20 ft with King of the Urban Jungle.
  - Line 5615–5625: King of the Urban Jungle (Level 5): Requires moving >= 20 ft immediately beforehand during turn. Specialist grapples to a chosen surface point within Hook range, gaining Flying Speed equal to 2x Hook range (60 ft or 100 ft). Must travel >= 10 ft in the air. Hook attacks prohibited while flying. First melee attack on landing deals +PB bonus damage and doubles forced movement.
  - Line 5626–5645: Bound in Rope (Level 5): 1 Prowess Action to grapple creature within Hook range (no more than 1 size larger) via DEX save vs Martial DC. Hook is locked while grappling. Bonus Action drags target up to 15 ft; Action hogties within 5 ft. Releasing grapple unlocks Hook.
  - Line 5646–5655: Wrangler (Level 5): 1 Prowess Action to latch onto creature > +1 size larger within Hook range via DEX save vs Martial DC. Enters creature's space, moves with creature without expending movement, gains Advantage on attack rolls against it, and can take a -5 attack penalty to bypass 5 Damage Reduction.
  - Line 5648–5655: Prowess triggers: +1 Prowess (1/turn) when creature within 30 ft takes falling/environmental damage; +1 Prowess (1/turn) when moving > 45 ft via flying speed.
  - Line 5656–5665: Mighty Push (Level 11): Action, PB / Long Rest (pool `mightyPush`, max `@prof`). STR save vs Martial DC. Interactive 8d6 Bludgeoning damage. On fail: full damage and 20 ft knockback; on save: half damage and 10 ft knockback. Collision with obstacles deals falling damage equal to knockback distance.
  - Line 5666–5672: Spider's Essence (Level 15): Longer Hook (50 ft range), Spider's Thread (Climbing Speed equal to Hook range towards surface point until next turn start; allies starting from location also gain it), Swing to Safety (Reaction while falling triggers King of the Urban Jungle to avoid falling damage).
  - Line 5673–5679: Scorpion Sting (Level 20): 1 / Long Rest (pool `scorpionSting`, max 1). 6 melee attacks at Advantage, each dealing weapon damage + half level (+10) bonus damage. Targets Grappled via Bound in Rope or Latched via Wrangler automatically suffer attacks without save.
- **Repository Baseline & Constraints**:
  - `WORKFLOW.md` §3.2: Confirm before use, warn without blocking ("Use anyway"), clamp overspend/shortfall at 0, no auto-rolled dice (interactive damage roll buttons), automatic GM relay via `validateTarget`, and encounter-window undo receipts.
  - `GEMINI.md`: Genuine state logic, full unit testing, reversibility verification.
- **Files Modified/Created**:
  - `ak5e/scripts/hookmaster-features.mjs` (Created, 638 lines)
  - `ak5e/test/hookmaster.test.mjs` (Created, 594 lines)
  - `ak5e/scripts/specialist-uses.mjs` (Integrated 14 Hookmaster plans, readings, undo cleanup)
  - `ak5e/scripts/specialist-sheet.mjs` (Integrated Hookmaster badge and action controls)
  - `ak5e/scripts/ak5e.mjs` (Exported hookmaster under `game.ak5e.specialist` and registered hooks)
  - `ak5e/test/base-classes-fixture.mjs` (Updated `isPlainObject` to preserve Set/Map instances)
  - `TODO.md` & `ak5e/DECISIONS.md` (Updated checklists and documented rulings)
- **Test Results**:
  - `node --test ak5e/test/hookmaster.test.mjs`: 14 passed, 0 failed (175 ms).
  - `node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor*.test.mjs ak5e/test/hookmaster.test.mjs`: 87 passed, 0 failed (225 ms).
  - `node ak5e/tools/validate-files.mjs`: 272 .mjs files valid.
  - `node ak5e/tools/verify-generated-content.mjs`: All 2193 top-level and 801 embedded records verified.

## 2. Logic Chain
1. *Subclass Detection & State Model*: Following the existing Executor architecture, `isHookmaster(actor)` checks `specialistBranch(actor) === "hookmaster"`. The actor flag `flags.ak5e.hookmaster` stores `hookedWeaponId`, `freeConversionUsed`, `hookLocked`, `grappledTarget`, `wranglerTarget`, `urbanJungle`, and `flyingMovementThisTurn`.
2. *Hooked Weapon Conversion & Reversion*: `canConvertWeaponToHook(item)` validates the Melee Weapon, Slashing/Piercing damage type, and absence of Two-Handed property. `convertHookedWeapon` snapshots original weapon properties and range, adds Two-Handed (`two`) and Thrown (`thr`), sets range to 30 ft (or 50 ft at level 15+), and sets `flags.ak5e.isHooked = true`. First conversion is marked free; subsequent conversions deduct 200 LMD (clamping at 0 if overridden upon shortfall). `revertHookedWeapon` restores the original weapon state and flags.
3. *Attack & Damage Mechanics*: `hookmasterPreRollAttack` and `hookmasterPreRollDamage` check if the attack is made with an active Hooked weapon. For ranged attacks (`rwak`), the difference `(strMod - dexMod)` is injected into parts so that Strength modifier is used instead of Dexterity modifier. For Wrangler latched targets, Advantage is applied and optional `-5` DR bypass is subtracted.
4. *Table-Play Operation Plans*: 14 plans were registered in `specialist-uses.mjs`:
   `convertHookedWeapon`, `revertHookedWeapon`, `bigBoot`, `kingOfUrbanJungle`, `boundInRope`, `dragBoundTarget`, `hogtie`, `releaseGrapple`, `wrangler`, `releaseWrangler`, `mightyPush`, `spidersThread`, `swingToSafety`, and `scorpionSting`.
   Every plan adheres to `WORKFLOW.md` §3.2: warnings are non-blocking and overridable; resource spends clamp at 0; interactive card summaries emit formula information rather than rolling dice silently; `validateTarget` automatically routes unowned-target operations to the GM; and `hookmasterCleanup` enables full encounter-window undo reversibility.
5. *Collection & Fixture Support*: `base-classes-fixture.mjs` was updated so that `isPlainObject` does not mistake `Set` or `Map` instances as plain objects, ensuring that item `system.properties` Sets are cleanly preserved during updates. In `hookmaster-features.mjs`, `listItems` safely unpacks Foundry collections, Maps, and Arrays.

## 3. Caveats
- Flying movement and same-space movement (King of the Urban Jungle and Wrangler) provide table-play prompts, speed bonuses, and state tracking; manual token grid placement is preserved as documented in `TODO.md` ("Manual-OK: flying movement, same-space rules").
- Environmental hazard and falling damage Prowess triggers hook into `onAk5eEvent("damageTaken")` and inspect creature distance within 30 ft; GM adjudication remains supported via standard Prowess adjustments if custom hazard events do not fire.

## 4. Conclusion
Milestone 3 (Hookmaster Specialist Subclass) is completely implemented according to AK5e Chapter 3 rules and `WORKFLOW.md` §3.2. All 14 feature areas and table-play plans are fully functional, integrated with the Specialist sheet and uses system, and verified by 87 passing automated tests with zero regressions.

## 5. Verification Method
Independently verify by executing:
```bash
# 1. Run Hookmaster 14-area test suite
node --test ak5e/test/hookmaster.test.mjs

# 2. Run full Specialist & Executor regression suite (87 tests)
node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor*.test.mjs ak5e/test/hookmaster.test.mjs

# 3. Validate file syntax across module
node ak5e/tools/validate-files.mjs

# 4. Verify generated content fidelity against v1.3.1 source
node ak5e/tools/verify-generated-content.mjs
```
Invalidation conditions: Any test failure, syntax error in `validate-files.mjs`, or regression in existing Specialist features.
