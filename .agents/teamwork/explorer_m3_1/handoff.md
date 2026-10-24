# Hookmaster Rules & Architecture Exploration Blueprint (Milestone 3)

## 1. Observation

### 1.1 Source Text & Rules Observations (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`)
Directly quoted and analyzed from Chapter 3 lines 5585–5679:

- **1st Level: Hooked (Lines 5588–5598):**
  > "You can convert a Melee Weapon into a Hook to be used with the rest of your Features; the weapon you choose must not have the Two-Handed Property, and it must deal Slashing or Piercing Damage. When you choose this Branch, you may convert one Melee Weapon from your Starting Equipment that meets these criteria for free. If you need to replace your Hook, or want additional Hooks, it requires 200 LMD, an hour of uninterrupted time, and a Melee Weapon to convert."
  > "A Weapon that has been converted into a Hook gains the following effects:
  > - Only Creatures with this Feature are considered to be Proficient with the Hook.
  > - Its Thrown Property, if it has one, is replaced with Thrown (30/-). If it does not have the Thrown Property, it gains the Thrown (30/-) Property. When you make an Attack with this Weapon using the Thrown Property, it immediately returns to you after the Attack.
  > - Your Hook gains the Two-Handed Property.
  > - When you make a Ranged Attack using your Hook, you may use your Strength Bonus instead of Dexterity for the Attack and Damage Rolls.
  > - When you hit a Creature no more than one size larger than you with a Ranged Attack using your Hook, you can pull that Creature 10 feet towards you.
  > - You can make a Ranged Attack using your Hook as a Bonus Action. You cannot make, or have made, any Ranged Attacks with your Hook on a Turn you do this."

- **5th Level: Covering Ground, Covering Options (Lines 5616–5627):**
  > "**Big Boot.** When you hit a Creature no more than one size larger than you with an Unarmed Strike, you can push that Creature 10 feet directly away from you."
  > "**King of the Urban Jungle.** During your Turn, if you have moved at least 20 feet immediately beforehand, you can choose a point on a surface you can see within range of your Hook (no Action required). If you do, you gain the following effects; these effects expire after you move, or at the end of your Turn:
  > - You cannot attack with your Hook.
  > - You gain a Flying Speed equal to twice the Range of your Hook. However, you cannot move further away from the chosen point than the range of your Hook, you cannot move any higher than the chosen point, and you must move at least 10 feet from the location you started flying.
  > If you deal Damage with a Melee Attack to a Creature immediately after making this flying movement, that Creature takes additional Damage equal to your Proficiency Bonus, and if the Creature would be forcibly moved as a result of that Damage, the distance they are moved is doubled."

- **5th Level: Ensnare and Entangle (Lines 5635–5649):**
  > "**Bound in Rope.** As an Action while you have your Hook equipped, you can expend 1 Prowess to choose a Creature no more than one size larger than you that you can see within range of your Hook; that Creature must succeed on a Dexterity Saving Throw against your Martial DC or become Grappled by you. A Creature Grappled in this way can use their Action to reattempt the Saving Throw, ending the effect on a success. The Condition also ends if you are further away than the range of your Hook, or if you end it during your Turn (no Action required).
  > While you have a Creature Grappled in this way, you can use your Bonus Action to drag them up to 15 feet towards you. While they are within 5 feet of you, you can hogtie that Creature as an Action; this has the same effect as applying Manacles to that Creature. While you have a Creature Grappled in this way, you cannot use that Hook to make Attacks, or to use your Features."
  > "**Wrangler.** As an Action while you have your Hook equipped, you can expend 1 Prowess to choose a Creature that is more than one size larger than you. That Creature must succeed on a Dexterity Saving Throw against your Martial DC, or your Hook latches onto them. When this occurs, you may immediately move to that Creature's space; for the duration, you may occupy the same space as that Creature. When the Creature you are hooked onto moves, you move along with them without consuming your own movement.
  > While you are hooked onto that Creature, your Attacks against only that Creature are made at Advantage. Additionally, you can take a -5 to the Attack Roll for an Attack against only that Creature to cause that Attack to ignore any Damage Reduction that Creature has.
  > At the end of their Turn, a Creature you are hooked to may reattempt the Saving Throw, shaking you off on a successful Save, ending this effect, and possibly causing you to take Damage from falling. Additionally, you may end the effect during your Turn (no Action required)."
  > "**Gaining Prowess as a Hookmaster.** As a Hookmaster, you gain 1 Prowess whenever you cause a Creature to take Damage from the environment, such as a result of falling or standing in a burning area. Additionally, you gain 1 Prowess at the end of a Turn you have moved more than 45 feet with a Flying Speed."

- **11th Level: Mighty Push (Lines 5653–5657):**
  > "As an Action, choose a Creature you can see within 5 feet; that Creature must make a Strength Saving Throw against your Martial DC. On a failed Save, they take 8d6 Bludgeoning Damage, and are knocked back 20 feet. On a successful Save, they take half as much Damage and are pushed back only half as much. If they collide with a wall or other solid surface as part of this movement, they take Damage as if they had fallen that distance. If they collide with another Creature, they both take Damage as if they had fallen that distance.
  > You can use this Feature a number of times equal to your Proficiency Bonus, and regain all expended uses when you complete a Long Rest."

- **15th Level: Spider's Essence (Lines 5658–5666):**
  > "**Longer Hook.** The Thrown Property of your Hooks is increased to Thrown (50/-)
  > **Spider's Thread.** As an Action, you can use your Hook to grapple to a surface of your choice above you, granting yourself a Climbing Speed until the beginning of your next Turn equal to the length of your Hook, but only when you are climbing towards your chosen point from the location you used this Feature. Additionally, until the beginning of your next Turn, other Creatures that begin climbing from the same location towards the same point also gain a climbing Speed equal to your Hook's Range until the end of their Turn.
  > **Swing to Safety.** You can now use your King of the Urban Jungle Feature as a Reaction while you are falling, as long as the height you are falling is enough for you to take falling Damage."

- **20th Level: Scorpion Sting (Lines 5667–5674):**
  > "As an Action while you have your Hook equipped, choose a Creature you can see within range of your Hook. That Creature must succeed on a Dexterity Saving Throw against your Martial DC. On a failed Save, you pull that Creature directly towards you until they are within 5 feet of you if they are no more than one size larger than you; if they are larger than this, you pull yourself directly towards them until you are within 5 feet of them.
  > After this movement, you can make 6 Attacks with your Hook against that Creature with Advantage. Each of these Attacks deals additional Weapon Damage equal to half your Specialist Level.
  > If you have a Creature that is either Grappled by you or you are hooked onto to, you can use this Feature on that Creature, ignoring restrictions limiting use of your Hook. If you do so, that Creature automatically fails their Saving Throw against this Feature.
  > Once you have used this Feature, you may not do so again until you have completed a Long Rest."

### 1.2 Codebase Patterns & Architecture Observations
- **Subclass Registration (`specialist-rules.mjs` lines 9–17, 305–315):**
  - `SPECIALIST_BRANCH_IDS["subclass-specialist-hookmaster"] = "hookmaster"`.
  - `isHookmaster(actor)` is already defined and checks `specialistBranch(actor) === "hookmaster"`.
  - `martialDC(actor)` computes `8 + pb + Math.max(strMod, dexMod)` (lines 159–165). Every Hookmaster saving throw (Bound in Rope, Wrangler, Mighty Push, Scorpion Sting) targets `martialDC`.
- **Precedent Subclass (`executor-features.mjs` lines 1–567):**
  - Models subclass state under `flags.ak5e.<subclass>`.
  - Registers subclass resource pools (`defineExecutorPools` using `definePool` from `resource-pools.mjs`).
  - Hooks attack and damage rolls via `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2`.
  - Listens to engine events via `onAk5eEvent("hit")`, `"kill"`, `"turnStart"`, `"turnEnd"`.
  - Exposes state helpers and predicates.
- **Table-Play Engine (`specialist-uses.mjs` lines 1–713):**
  - Uses `createPlayUses({ ns: "specialistUses", label: "Specialist" })`.
  - Registers plans through `ALL_PLANS`.
  - Enforces WORKFLOW §3.2:
    - Pre-execution checks (`need(...)`).
    - Non-blocking warnings (`warn(warnings, type, message)`).
    - Resource spend via `spendResource` (0-clamped).
    - Interactive roll buttons via `receipt.formula`, `receipt.dc`, `receipt.rollLabel` without auto-rolling.
    - GM target relay via `validateTarget(source, receipt, entry, target) => entry.uuid === target.uuid`.
    - Encounter-window undo through `specialistUses.undo(actor, useId)`.
- **ActorSheetV2 UI (`specialist-sheet.mjs` lines 66–74, 167–175):**
  - `getHookedWeaponStatusText(actor)` already inspects `flags.ak5e.hookmaster` or item flags.
  - Subclass action section currently contains a placeholder awaiting Milestone 3.
- **Module Registration (`ak5e/scripts/ak5e.mjs` lines 94–113, 298–345, 476):**
  - `game.ak5e.specialist` exposes subclass namespaces (`executor`).
  - Subclass lifecycle hooks are registered on `ready` (`registerExecutorHooks()`).
- **Test Infrastructure (`ak5e/test/base-classes-fixture.mjs` & `executor.test.mjs`):**
  - High-fidelity in-memory Foundry document mocks (`createTestActor`, `createTestItem`, `createTestCombat`).
  - Mocks support `item.update`, `actor.update`, `getFlag`, `setFlag`, `TestCollection`.

---

## 2. Logic Chain

### 2.1 Hooked Weapon Conversion & Reversion State Machine
1. **Prerequisite Validation:**
   - The actor must be an identified Hookmaster: `isHookmaster(actor) === true`.
   - The item must be an owned weapon document (`item.type === "weapon"`).
   - The weapon must be melee: `item.system?.actionType === "mwak"` or `item.system?.type?.value === "melee"` or simple/martial melee.
   - The weapon must NOT have the Two-Handed property (`props.has("two") || props.has("twoHanded") === false`).
   - The weapon must deal Slashing or Piercing damage (`getWeaponDamageTypes(item)` contains `"slashing"` or `"piercing"`).
2. **Cost & Frequency:**
   - First conversion from starting equipment is free: tracked on `actor.flags.ak5e.hookmaster.freeConversionUsed`.
   - Subsequent conversions or replacements cost 200 LMD and require 1 hour uninterrupted time: if currency is tracked on `actor.system.currency`, verify/warn if insufficient, and deduct 200 LMD (with "Use anyway" override support).
3. **Applied Weapon Modifications:**
   - Save original state snapshot in `flags.ak5e.hookmaster.originalItemState = { properties: [...itemProps], range: structuredClone(itemRange), name: item.name }` for complete reversibility.
   - Set flags: `flags.ak5e.hookmaster.isHooked = true` and `flags.ak5e.isHooked = true`.
   - Add Two-Handed property (`"two"`).
   - Set Thrown property (`"thr"`):
     - If actor level < 15: Range 30/- (`range.value = 30`, `range.long = null`).
     - If actor level >= 15 (Spider's Essence): Range 50/- (`range.value = 50`, `range.long = null`).
   - Ranged attacks use Strength for attack and damage: intercepted in `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2` when `isHookedWeapon(item) && actionType === "rwak"`.
   - Thrown attack immediately returns to hand (tracked in item summary / descriptor).
   - Only Hookmasters are proficient: verified by `isProficientWithHook(actor, item)`.
   - Pull on hit: Ranged Hook attack hitting a creature `<= actor size + 1` can pull that creature 10 ft towards the Hookmaster.
   - Bonus Action Ranged Attack restriction:
     - Player can make a Ranged Attack with the Hook as a Bonus Action.
     - Restriction: cannot make or have made any other Ranged Attacks with the Hook on that turn.
     - State tracking: `flags.ak5e.hookmaster.rangedHookAttacksThisTurn` and `flags.ak5e.hookmaster.bonusActionHookAttackUsedThisTurn`, reset on `turnStart`.
4. **Reversion & Undo:**
   - Table-play plan `revertHookedWeapon` restores original properties and range, resets flags, and refunds spent LMD or resets `freeConversionUsed`.
   - Standard encounter-window undo (`specialistUses.undo`) cleanly reverts the operation.

### 2.2 Size Comparison Engine
Both Big Boot, Bound in Rope, Wrangler, and Scorpion Sting hinge on relative creature sizes:
- Size ordering index: `tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5`.
- `isNoMoreThanOneSizeLarger(actor, target)`: `targetSizeVal <= actorSizeVal + 1`.
  - True for: Medium actor vs Medium or Large target; Small actor vs Small or Medium target.
  - Used for: Hooked weapon 10 ft pull on hit, Big Boot 10 ft push, Bound in Rope grapple, Scorpion Sting pull-target-to-actor.
- `isMoreThanOneSizeLarger(actor, target)`: `targetSizeVal > actorSizeVal + 1`.
  - True for: Medium actor vs Huge or Gargantuan target; Small actor vs Large, Huge, or Gargantuan target.
  - Used for: Wrangler latch, Scorpion Sting pull-actor-to-target.

### 2.3 Covering Ground & Ensnare Features (Level 5)
1. **Big Boot:**
   - Trigger: Unarmed strike hit.
   - Target size `<= actor size + 1`.
   - Pushes target 10 feet directly away.
   - Synergy with King of the Urban Jungle: If Urban Jungle flying was performed immediately beforehand, distance is doubled to 20 feet!
2. **King of the Urban Jungle:**
   - Prerequisite: 20 ft pre-movement on current turn (warns if not checked, allows "Use anyway").
   - Action cost: No action required during turn.
   - Range: Within Hook range (30 ft, or 50 ft at Lv 15).
   - Grants Flying Speed = `2 * hookRange` (60 ft at Lv 5–14; 100 ft at Lv 15+).
   - Restrictions: Cannot attack with Hook while flying; cannot move higher than or further than Hook range from chosen point; must move at least 10 ft.
   - Melee strike rider: Immediate melee attack hit deals `+PB` damage, and doubled forced movement.
   - Prowess trigger: If flying movement exceeds 45 ft on this turn, triggers Hookmaster Prowess gain (+1 Prowess at turn end).
3. **Bound in Rope:**
   - Cost: Action + 1 Prowess.
   - Prerequisite: Hook equipped.
   - Target: Creature within Hook range, size `<= actor size + 1`.
   - Save: DEX save vs Martial DC (`8 + pb + max(str, dex)`).
   - On failed save: Target is Grappled by Specialist; Hook use is locked (`flags.ak5e.hookmaster.hookLocked = true`).
   - Drag: Bonus Action to drag grappled creature up to 15 ft towards Specialist.
   - Hogtie: Action while within 5 ft to hogtie (applies Manacles / Restrained effect).
   - Release: Free action on turn to release grapple, unlocking Hook.
4. **Wrangler:**
   - Cost: Action + 1 Prowess.
   - Prerequisite: Hook equipped.
   - Target: Creature `> actor size + 1`.
   - Save: DEX save vs Martial DC.
   - On failed save: Hook latches onto target; Specialist moves to target's space and shares space; moves along with target without consuming movement.
   - Advantage: Attacks against only that creature have Advantage.
   - Damage Reduction Bypass: Option to take `-5` penalty to attack roll to ignore all Damage Reduction on that creature.
   - Target reattempts DEX save vs Martial DC at end of their turn (shakes off on success).
5. **Hookmaster Prowess Gain Triggers:**
   - Trigger A: Causing a creature to take environmental, falling, or collision damage refunds/grants 1 Prowess.
   - Trigger B: Moving > 45 ft with Flying speed on a turn refunds/grants 1 Prowess at turn end.

### 2.4 Higher-Level Subclass Features (Levels 11, 15, 20)
1. **Mighty Push (Level 11):**
   - Resource: Dedicated pool `mightyPush` (max = `@prof`, recovers toMax on Long Rest).
   - Action: Target within 5 ft makes STR save vs Martial DC.
   - Interactive card: clickable `8d6` Bludgeoning damage roll button.
   - Failed save: `8d6` damage, 20 ft knockback.
   - Successful save: half damage (`floor(dmg / 2)`), 10 ft knockback.
   - Collision rule: If target collides with a wall/obstacle or another creature, both take falling damage equal to distance moved (2d6 on 20 ft fail, 1d6 on 10 ft save). Card provides interactive collision damage roll button.
2. **Spider's Essence (Level 15):**
   - Longer Hook: Hook range increases to 50 ft (`calculateHookRange` returns 50; Urban Jungle flying speed scales to 100 ft).
   - Spider's Thread: Action to grapple surface above; grants 50 ft climbing speed towards chosen surface until start of next turn; allies starting from same point gain 50 ft climbing speed until end of their turn.
   - Swing to Safety: King of the Urban Jungle can be activated as a Reaction while falling (if falling distance >= 10 ft).
3. **Scorpion Sting (Level 20):**
   - Resource: Dedicated pool `scorpionSting` (max = 1, recovers toMax on Long Rest).
   - Action: Creature within Hook range (50 ft).
   - Auto-Fail Exception: If target is Grappled (Bound in Rope) or Latched (Wrangler), target **automatically fails** DEX save, and Hook lockout restrictions are completely ignored!
   - Normal Save: Otherwise, target makes DEX save vs Martial DC.
   - Movement: If size `<= actor size + 1`, pull target to 5 ft; if `> actor size + 1`, pull Specialist to target.
   - Attack Flurry: Specialist makes 6 Attacks with Hook against target with Advantage.
   - Bonus Weapon Damage: Each attack deals additional weapon damage equal to `floor(specialistLevel / 2)` (+10 damage at Level 20).
   - Interactive roll buttons on chat card: 6 attack buttons with Advantage and `+10` damage bonus.

---

## 3. Caveats
1. **Foundry D&D5e Weapon Properties Schema:**
   - In Foundry V13 / dnd5e, item properties can be represented either as a `Set` (e.g. `properties.has("two")`) or an `Array` (e.g. `properties.includes("two")`). The implementation must support both representations defensively.
2. **LMD Currency Field:**
   - AK5e characters track LMD under `system.currency.lmd` or D&D5e standard currency (e.g. `gp`). If `system.currency` is not configured or missing, conversion should warn without throwing, allowing free/mocked conversion per WORKFLOW §3.2.
3. **Falling Damage Calculation:**
   - D&D5e standard falling damage is 1d6 bludgeoning per 10 feet fallen. For Mighty Push collisions, 20 ft knockback collision = 2d6, 10 ft knockback collision = 1d6.

---

## 4. Conclusion & Technical Blueprint

### 4.1 Target File Structure & Exports

#### 1. `ak5e/scripts/hookmaster-features.mjs`
```javascript
/**
 * Hookmaster Specialist Subclass features (Ch. 3 L5585–5679).
 * Pure and functional logic, state inspection, resource pools, and mechanical hooks.
 * Supports Hooked weapon conversion, Big Boot, King of the Urban Jungle,
 * Bound in Rope, Wrangler, Hookmaster Prowess triggers, Mighty Push,
 * Spider's Essence, and Scorpion Sting.
 */
```
**Exported Symbols:**
- `HOOKMASTER_SUBCLASS_ID = "subclass-specialist-hookmaster"`
- `SIZE_ORDER = Object.freeze({ tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5 })`
- `isHookmaster(actor)`
- `isHookedWeapon(item)`
- `isProficientWithHook(actor, item)`
- `getHookedWeapon(actor)`
- `calculateHookRange(actor)` -> `specialistLevel(actor) >= 15 ? 50 : 30`
- `getCreatureSize(actor)`
- `getSizeValue(actor)`
- `isNoMoreThanOneSizeLarger(actor, target)`
- `isMoreThanOneSizeLarger(actor, target)`
- `canConvertWeaponToHook(item)` -> `{ valid: boolean, reasons: string[] }`
- `getWeaponDamageTypes(item)` -> `Set<string>`
- `getHookmasterState(actor)` -> `{ freeConversionUsed, hookLocked, grappledTarget, wranglerTarget, urbanJungle, flyingMovementThisTurn, ... }`
- `isHookLocked(actor)` -> `Boolean`
- Feature predicates: `hasBigBoot(actor)`, `hasKingOfUrbanJungle(actor)`, `hasBoundInRope(actor)`, `hasWrangler(actor)`, `hasMightyPush(actor)`, `hasSpidersEssence(actor)`, `hasLongerHook(actor)`, `hasSpidersThread(actor)`, `hasSwingToSafety(actor)`, `hasScorpionSting(actor)`
- Resource pool definition: `defineHookmasterPools()` (`mightyPush`, `scorpionSting`)
- Hook callbacks & lifecycle: `hookmasterPreRollAttack`, `hookmasterPreRollDamage`, `registerHookmasterHooks`

#### 2. `ak5e/scripts/specialist-uses.mjs`
Add `HOOKMASTER_PLANS` and `HOOKMASTER_READINGS`:
- Plans:
  1. `convertHookedWeapon(actor, state, data)`: validates prerequisites, cost (free vs 200 LMD), modifies weapon properties (Two-Handed, Thrown 30/50, returning), sets `flags.ak5e.hookmaster.isHooked = true`, snapshots original state for undo.
  2. `revertHookedWeapon(actor, state, data)`: restores original weapon properties and range, resets flags, refunds LMD/free status.
  3. `bigBoot(actor, state, data)`: validates size `<= +1`, applies 10 ft push (doubled to 20 ft if Urban Jungle active).
  4. `kingOfUrbanJungle(actor, state, data)`: checks 20 ft pre-movement, grants flying speed `2 * hookRange`, sets Urban Jungle active state (+PB damage & doubled push on immediate melee hit).
  5. `boundInRope(actor, state, data)`: spends 1 Prowess, checks size `<= +1`, sets DEX save vs Martial DC, on fail sets Grappled status and locks Hook.
  6. `dragBoundTarget(actor, state, data)`: Bonus Action 15 ft drag towards Specialist.
  7. `hogtie(actor, state, data)`: Action within 5 ft, applies Manacles / Restrained effect.
  8. `releaseGrapple(actor, state, data)`: voluntary release, unlocks Hook.
  9. `wrangler(actor, state, data)`: spends 1 Prowess, checks size `> +1`, sets DEX save vs Martial DC, on fail latches to target (shared space, Advantage on attacks, optional -5 attack penalty for DR bypass).
  10. `releaseWrangler(actor, state, data)`: voluntary release of latch.
  11. `mightyPush(actor, state, data)`: spends 1 use of `mightyPush` (PB/LR), STR save vs Martial DC, interactive `8d6` damage button, 20 ft knockback (half dmg + 10 ft on save), collision damage card button.
  12. `spidersThread(actor, state, data)`: Action, grants 50 ft climb speed to point and aura for allies.
  13. `swingToSafety(actor, state, data)`: Reaction while falling >= 10 ft, spends reaction, triggers Urban Jungle.
  14. `scorpionSting(actor, state, data)`: spends 1 use of `scorpionSting` (1/LR), checks if target is Grappled or Latched (if so, auto-fail DEX save and bypass Hook lockout; otherwise DEX save vs Martial DC), pulls target/Specialist to 5 ft, renders 6 interactive Hook attack buttons with Advantage and `+half level` (+10) damage.
- Target Validators:
  - `bigBoot.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;`
  - `boundInRope.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;`
  - `dragBoundTarget.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;`
  - `hogtie.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;`
  - `wrangler.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;`
  - `mightyPush.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;`
  - `scorpionSting.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;`

#### 3. `ak5e/scripts/specialist-sheet.mjs`
- Update `openSpecialistControls()`:
  - When `isHookmaster(actor)` is true:
    - Display Hooked Weapon status badge: `Hooked Weapon: <Weapon Name>` or `Hooked Weapon: None`.
    - If no hooked weapon: button `convertHookedWeapon`.
    - If hooked weapon active: button `revertHookedWeapon`.
    - Level 5+: `bigBoot`, `kingOfUrbanJungle`, `boundInRope`, `wrangler`.
    - If Bound in Rope active: `dragBoundTarget`, `hogtie`, `releaseGrapple`.
    - If Wrangler active: `releaseWrangler`.
    - Level 11+: `mightyPush`.
    - Level 15+: `spidersThread`, `swingToSafety`.
    - Level 20+: `scorpionSting`.
- Update `handleSpecialistCommand()` to wrap all Hookmaster commands with `confirmPlayUse`.

#### 4. `ak5e/scripts/ak5e.mjs`
- Import `registerHookmasterHooks` and exported helpers from `./hookmaster-features.mjs`.
- Expose `game.ak5e.specialist.hookmaster`.
- In `Hooks.once("ready", ...)`: call `registerHookmasterHooks()`.

---

## 5. Verification Method

### 5.1 Test Suite Blueprint (`ak5e/test/hookmaster.test.mjs`)
The unit test suite should contain 14 comprehensive test areas matching the rigor of `executor.test.mjs`:
1. **Area 1: Hookmaster Identification & Subclass Predicates**
   - Verify `isHookmaster(actor)` returns true for actors with `subclass-specialist-hookmaster`.
   - Verify `specialistBranch(actor) === "hookmaster"`.
   - Verify non-Hookmaster Specialist returns false.
2. **Area 2: Hooked Weapon Conversion Prerequisites & Validation**
   - Convert valid Melee Slashing weapon (e.g. Scimitar, Longsword) -> succeeds.
   - Convert valid Melee Piercing weapon (e.g. Shortsword, Rapier, Spear) -> succeeds.
   - Attempt conversion on Two-Handed weapon (e.g. Greatsword, Pike) -> rejected / warned.
   - Attempt conversion on Ranged weapon (e.g. Shortbow, Heavy Crossbow) -> rejected / warned.
   - Attempt conversion on Bludgeoning-only weapon (e.g. Club, Mace) -> rejected / warned.
3. **Area 3: Free Starting Conversion vs 200 LMD Cost**
   - First conversion is free and sets `freeConversionUsed = true`.
   - Subsequent conversion warns on 200 LMD cost and deducts currency or records shortfall.
4. **Area 4: Converted Weapon Mechanical Properties**
   - Item gains Two-Handed property (`props.has("two")`).
   - Item gains Thrown (30/-) property (`props.has("thr")`, `range.value === 30`).
   - At Level 15+, Thrown range is updated/evaluated as 50/- (`range.value === 50`).
   - Weapon immediately returns after thrown attack.
   - Only Hookmasters are proficient (`isProficientWithHook`).
   - Ranged attack and damage rolls use Strength modifier.
   - Ranged hit pulls target `<= +1 size` 10 feet.
   - Bonus Action Ranged Attack restriction (cannot make other ranged Hook attacks on turn).
5. **Area 5: Level 5 - Big Boot**
   - Unarmed strike against creature `<= +1 size` pushes 10 feet away.
   - Warning if creature is `> +1 size`.
   - Doubled to 20 feet if King of the Urban Jungle was used beforehand.
6. **Area 6: Level 5 - King of the Urban Jungle**
   - Checks 20 ft pre-movement requirement (warns if unmet).
   - Grants Flying Speed = `2 * hookRange` (60 ft at Lv 5, 100 ft at Lv 15).
   - Hook attack restriction while flying.
   - Immediate melee hit deals `+PB` damage and doubles forced movement.
   - Moving > 45 ft with Flying speed triggers +1 Prowess gain at turn end.
7. **Area 7: Level 5 - Bound in Rope**
   - Expends 1 Prowess.
   - Requires Hook equipped.
   - Warning if target `> +1 size`.
   - Target DEX save vs Martial DC.
   - Failed save applies Grappled condition and locks Hook (`isHookLocked === true`).
   - Bonus Action drag 15 ft.
   - Action hogtie within 5 ft.
   - Voluntary release unlocks Hook.
8. **Area 8: Level 5 - Wrangler**
   - Expends 1 Prowess.
   - Requires Hook equipped.
   - Warning if target `<= +1 size` (requires `> +1 size`).
   - Target DEX save vs Martial DC.
   - Failed save latches onto target, shares space, moves with target.
   - Advantage on attacks against target.
   - Optional -5 attack penalty to ignore Damage Reduction.
9. **Area 9: Hookmaster Prowess Gain Triggers**
   - Causing environmental, falling, or collision damage grants 1 Prowess.
   - Moving > 45 ft with Flying speed on turn grants 1 Prowess on `turnEnd`.
10. **Area 10: Level 11 - Mighty Push**
    - Uses `mightyPush` pool (`max = @prof`, LR recovery).
    - Target within 5 ft makes STR save vs Martial DC.
    - Card renders interactive `8d6` Bludgeoning damage button.
    - Failed save: `8d6` damage + 20 ft knockback.
    - Saved: half damage + 10 ft knockback.
    - Obstacle collision damage (2d6 on fail, 1d6 on save).
11. **Area 11: Level 15 - Spider's Essence**
    - Longer Hook increases range to 50/-.
    - Spider's Thread grants 50 ft climbing speed and ally aura.
    - Swing to Safety allows King of the Urban Jungle as Reaction while falling >= 10 ft.
12. **Area 12: Level 20 - Scorpion Sting**
    - Uses `scorpionSting` pool (`max = 1`, LR recovery).
    - Within Hook range (50 ft).
    - If target Grappled (Bound in Rope) or Latched (Wrangler): auto-fails DEX save and ignores Hook lockout.
    - Pulls target within 5 ft (or pulls Specialist if `> +1 size`).
    - 6 advantaged Hook attacks, each dealing `+half level` (+10) weapon damage.
13. **Area 13: Table-Play Reversibility & Encounter-Window Undo**
    - Every action records an undo receipt in `flags.ak5e.specialistUses.undo`.
    - Executing `specialistUses.undo(actor, useId)` cleanly reverts weapon conversions, Prowess spends, pool spends, reactions, and flag changes.
14. **Area 14: GM Target Relay & `validateTarget`**
    - Unowned target modifications relay automatically through `validateTarget`.

### 5.2 Verification Commands
```bash
# Focused Hookmaster & Specialist Unit Tests
node --test ak5e/test/hookmaster.test.mjs ak5e/test/specialist-rules.test.mjs ak5e/test/executor.test.mjs

# Base Classes Full Regression
node --test ak5e/test/specialist-*.test.mjs ak5e/test/base-classes-fixture.mjs

# Static File & Schema Validation
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs
```

### 5.3 Invalidation Conditions
- Any Hookmaster feature auto-rolling player dice (violates WORKFLOW §3.2).
- Failing to clamp overspent resources at 0 or failing to provide "Use anyway" on warnings.
- Missing GM relay on unowned target changes (`validateTarget`).
- Mutating actor state upon merely viewing or opening dialogs without confirmation.
