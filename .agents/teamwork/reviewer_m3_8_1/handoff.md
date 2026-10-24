# Handoff Report — Milestone 3 Review: Hookmaster Specialist Subclass

## 1. Observation

### 1.1 Verbatim Rules Authority (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`)
- **Hooked Weapon Conversion & Mechanics (Lines 5588–5598)**:
  - Line 5589: *"When you choose this Branch, you may convert one Melee Weapon from your Starting Equipment that meets these criteria for free. If you need to replace your Hook, or want additional Hooks, it requires 200 LMD, an hour of uninterrupted time, and a Melee Weapon to convert."*
  - Line 5593: *"Its Thrown Property, if it has one, is replaced with Thrown (30/-). If it does not have the Thrown Property, it gains the Thrown (30/-) Property. When you make an Attack with this Weapon using the Thrown Property, it immediately returns to you after the Attack."*
  - Line 5594: *"Your Hook gains the Two-Handed Property."*
  - Line 5595: *"When you make a Ranged Attack using your Hook, you may use your Strength Bonus instead of Dexterity for the Attack and Damage Rolls."*
  - Line 5596: *"When you hit a Creature no more than one size larger than you with a Ranged Attack using your Hook, you can pull that Creature 10 feet towards you."*
  - Line 5597: *"You can make a Ranged Attack using your Hook as a Bonus Action. You cannot make, or have made, any Ranged Attacks with your Hook on a Turn you do this."*
- **Big Boot & King of the Urban Jungle (Lines 5619–5627)**:
  - Line 5619: *"Big Boot. When you hit a Creature no more than one size larger than you with an Unarmed Strike, you can push that Creature 10 feet directly away from you."*
  - Line 5621–5623: *"King of the Urban Jungle. During your Turn, if you have moved at least 20 feet immediately beforehand, you can choose a point on a surface you can see within range of your Hook (no Action required)... You cannot attack with your Hook. You gain a Flying Speed equal to twice the Range of your Hook."*
  - Line 5626: *"If you deal Damage with a Melee Attack to a Creature immediately after making this flying movement, that Creature takes additional Damage equal to your Proficiency Bonus, and if the Creature would be forcibly moved as a result of that Damage, the distance they are moved is doubled."*
- **Bound in Rope & Wrangler (Lines 5638–5649)**:
  - Line 5638: *"Bound in Rope. As an Action while you have your Hook equipped, you can expend 1 Prowess to choose a Creature no more than one size larger than you that you can see within range of your Hook; that Creature must succeed on a Dexterity Saving Throw against your Martial DC or become Grappled by you."*
  - Line 5640: *"While you have a Creature Grappled in this way, you can use your Bonus Action to drag them up to 15 feet towards you. While they are within 5 feet of you, you can hogtie that Creature as an Action; this has the same effect as applying Manacles to that Creature. While you have a Creature Grappled in this way, you cannot use that Hook to make Attacks, or to use your Features."*
  - Line 5642: *"Wrangler. As an Action while you have your Hook equipped, you can expend 1 Prowess to choose a Creature that is more than one size larger than you. That Creature must succeed on a Dexterity Saving Throw against your Martial DC, or your Hook latches onto them... you may occupy the same space as that Creature. When the Creature you are hooked onto moves, you move along with them without consuming your own movement."*
  - Line 5644: *"While you are hooked onto that Creature, your Attacks against only that Creature are made at Advantage. Additionally, you can take a -5 to the Attack Roll for an Attack against only that Creature to cause that Attack to ignore any Damage Reduction that Creature has."*
  - Line 5648: *"Gaining Prowess as a Hookmaster. As a Hookmaster, you gain 1 Prowess whenever you cause a Creature to take Damage from the environment, such as a result of falling or standing in a burning area. Additionally, you gain 1 Prowess at the end of a Turn you have moved more than 45 feet with a Flying Speed."*
- **Mighty Push, Spider's Essence & Scorpion Sting (Lines 5653–5674)**:
  - Line 5654: *"Mighty Push. As an Action, choose a Creature you can see within 5 feet; that Creature must make a Strength Saving Throw against your Martial DC. On a failed Save, they take 8d6 Bludgeoning Damage, and are knocked back 20 feet. On a successful Save, they take half as much Damage and are pushed back only half as much. If they collide with a wall or other solid surface... take Damage as if they had fallen that distance."* PB/LR uses.
  - Line 5661–5665: *"Longer Hook. The Thrown Property of your Hooks is increased to Thrown (50/-). Spider's Thread... Climbing Speed equal to the length of your Hook... Swing to Safety. You can now use your King of the Urban Jungle Feature as a Reaction while you are falling, as long as the height you are falling is enough for you to take falling Damage."*
  - Line 5668–5671: *"Scorpion Sting. As an Action while you have your Hook equipped, choose a Creature you can see within range of your Hook. That Creature must succeed on a Dexterity Saving Throw against your Martial DC. On a failed Save, you pull that Creature directly towards you until they are within 5 feet of you if they are no more than one size larger than you; if they are larger than this, you pull yourself directly towards them... make 6 Attacks with your Hook against that Creature with Advantage. Each of these Attacks deals additional Weapon Damage equal to half your Specialist Level. If you have a Creature that is either Grappled by you or you are hooked onto to, you can use this Feature on that Creature, ignoring restrictions limiting use of your Hook. If you do so, that Creature automatically fails their Saving Throw against this Feature."* 1/LR.

### 1.2 Code Inspection Observations
1. **`ak5e/scripts/hookmaster-features.mjs`**:
   - Lines 254–255:
     ```javascript
     rangedHookAttacksThisTurn: Number(f.rangedHookAttacksThisTurn ?? 0),
     bonusActionHookAttackUsedThisTurn: Boolean(f.bonusActionHookAttackUsedThisTurn)
     ```
   - Lines 595–596 & 603–604: In `onAk5eEvent("turnStart")`, these two fields are reset to `0` and `false`.
   - **Nowhere else in the entire repository** is `rangedHookAttacksThisTurn` or `bonusActionHookAttackUsedThisTurn` written, modified, or tested. There is no plan or sheet control for making a Bonus Action Hook Attack, and no warning or restriction is enforced when attacking with the Hook.
   - **The 10 ft pull on Ranged Hook attack hit (Ch. 3 L5596) is completely absent** from `hookmaster-features.mjs` and `specialist-uses.mjs`.
   - In `hookmasterPreRollAttack` (lines 413–465), neither `isHookLocked(actor)` (Bound in Rope) nor `state.urbanJungle?.active` (King of the Urban Jungle) is checked. Attacks with the Hook are neither warned nor restricted while grappling or flying.
   - In `onAk5eEvent("hit")` (lines 545–551):
     ```javascript
     if (state.urbanJungle?.active && (event.actionType === "mwak" || event.isMelee)) {
       await actor.update({ "flags.ak5e.hookmaster.urbanJungle.active": false });
     }
     ```
     This immediately deactivates `urbanJungle.active` on a melee hit before the player can click `bigBoot`, which checks `hmState.urbanJungle?.active` to determine whether push distance is 10 ft or 20 ft.
2. **`ak5e/scripts/specialist-uses.mjs`**:
   - Lines 863, 993, 1029, 1062, 1159, 1238, 1373:
     ```javascript
     // bigBoot:
     receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "move" });
     // boundInRope, hogtie, wrangler, scorpionSting:
     receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "effect" });
     // dragBoundTarget:
     receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "move" });
     // mightyPush:
     receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "damage" });
     ```
   - None of these pushed entries set `ready: true`.
   - In `ak5e/scripts/play-uses.mjs` (line 300):
     ```javascript
     receipt.status = receipt.targets?.some(entry => !entry.ready) || (receipt.damageParts?.length && receipt.roll === undefined) || (receipt.formula && receipt.roll === undefined) ? "awaitingRoll" : "complete";
     ```
     Because `entry.ready` is undefined (falsy), `receipt.status` resolves to `"awaitingRoll"` for all 6 abilities even when no roll is pending.
   - In `ak5e/scripts/play-uses-sheet.mjs` (line 80):
     ```javascript
     if (receipt.status === "awaitingRoll") add(`Roll ${receipt.formula}${receipt.rollLabel ? ` ${receipt.rollLabel}` : ""}`, () => confirmPlayUse(...));
     ```
     Since `receipt.formula` is undefined on `bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, and `scorpionSting`, the chat card renders a button labeled **"Roll undefined"**. Clicking it invokes `engine.command(actor, "useRoll", { useId: receipt.id })`, which throws verbatim: `Error: Choose a use that is waiting for its roll.` at `play-uses.mjs:348`.
   - On `mightyPush`, which does define `receipt.formula = "8d6"`, executing `specialistUses.command(actor, "useRoll", { useId: "op-push" })` with a valid target throws:
     `Error: Not applied yet: Cannot read properties of undefined (reading 'apply'). The use is recorded; retry it from the panel.`
     because `KINDS["damage"]` is undefined in `play-uses.mjs` (unlike `medic-uses.mjs`, which explicitly registered `targetKinds: { damage: ... }`).
   - Lines 1386–1399: `validateTarget` was implemented on `bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, `mightyPush`, and `scorpionSting` as simple identity checks (`entry.uuid === target.uuid`), which were tested only in isolation in `hookmaster.test.mjs:Area 14` without ever testing actual target relay or card roll resolution.
3. **`ak5e/test/hookmaster.test.mjs`**:
   - `rangedHookAttacksThisTurn` and `bonusActionHookAttackUsedThisTurn` are never tested or mentioned.
   - 10 ft pull on Ranged Hook attack is never tested or mentioned.
   - `useRoll` is never tested on `mightyPush`.
   - `hookmaster.test.mjs:Area 5` test for Big Boot push doubling artificially set `actor.flags.ak5e.hookmaster.urbanJungle = { active: true }` immediately before calling `bigBoot`, bypassing the `hit` event that in real gameplay clears `urbanJungle.active`.

---

## 2. Logic Chain

1. **Integrity Violation — Facade Implementation of Bonus Action Hook Attack & Omission of 10 ft Pull**:
   - Observation: Ch. 3 lines 5596–5597 specify: (a) 10 ft pull on hit with Ranged Hook attack against creatures <= +1 size larger; (b) Bonus Action Ranged Attack with Hook with the explicit restriction that no other ranged Hook attacks may be made or have been made that turn.
   - Observation: In `hookmaster-features.mjs`, `rangedHookAttacksThisTurn` and `bonusActionHookAttackUsedThisTurn` were added to `getHookmasterState` and reset on `turnStart`, but have zero read/write call sites anywhere in the codebase. No Bonus Action Hook Attack plan or sheet button exists. The 10 ft pull mechanic is entirely absent.
   - In accordance with the Reviewer & Adversarial Critic instructions (*"Dummy or facade implementations that look correct but implement no real logic... If you detect ANY of these patterns, your verdict MUST be REQUEST_CHANGES with a Critical finding tagged as INTEGRITY VIOLATION"*), this constitutes an integrity violation.
2. **Critical Runtime Defect — Broken Chat Cards and Target Lifecycle Crash**:
   - Observation: Pushing target entries with `kind: "move"` and `kind: "effect"` without `ready: true` leaves receipts permanently in `receipt.status = "awaitingRoll"` across 6 Hookmaster plans.
   - Observation: Chat card rendering injects a broken "Roll undefined" button that throws if clicked.
   - Observation: On `mightyPush`, `entry.kind = "damage"` has no corresponding handler in `KINDS`, causing `useRoll` to crash with `Cannot read properties of undefined (reading 'apply')`.
   - Conclusion: The target validation and roll buttons for Hookmaster plans are critically broken in table play and cannot be approved.
3. **Major Rules Fidelity & State Race Defects**:
   - Observation: In `onAk5eEvent("hit")`, `urbanJungle.active` is immediately cleared on a melee hit. A player executing an Unarmed Strike then clicking Big Boot finds `urbanJungle.active` already `false`, breaking the doubled forced movement mechanic.
   - Observation: Neither `hookmasterPreRollAttack` nor active plans warn when attacks or features are attempted while Hook is locked (Bound in Rope) or while flying (King of the Urban Jungle).
   - Observation: In `wrangler`, the `-5` attack penalty is locked at initial latch time rather than per attack, and the resulting `_ak5eWranglerIgnoreDR = true` flag is never connected to `damage-pipeline.mjs`, leaving DR unbypassed.

---

## 3. Caveats

- Pure mathematical calculations for Hook range (30 ft vs 50 ft), martial DC, Strength modifier application for ranged attacks and damage rolls, and free conversion vs 200 LMD cost are cleanly implemented and pass unit checks.
- Undo restoration for currency, weapon properties, and Prowess expenditure on the Specialist actor works as designed when unhindered by target entry relay issues.
- Live in-Foundry Playwright browser testing on port 30175 with rendered screenshots was not scheduled for Milestone 3 (it is designated for Milestone 5 in SCOPE.md).

---

## 4. Conclusion & Review Summary

**Verdict**: **REQUEST_CHANGES**

### Findings

#### [Critical] Finding 1: INTEGRITY VIOLATION — Facade Implementation of BA Hook Attack & Omission of 10 ft Pull
- **What**: Dummy state flags `rangedHookAttacksThisTurn` and `bonusActionHookAttackUsedThisTurn` were placed in `getHookmasterState` and reset in `turnStart`, but implement no actual logic, checks, plans, or tests. The 10 ft pull on Ranged Hook attack hits (Ch. 3 L5596) and the Bonus Action Hook Attack (Ch. 3 L5597) are completely absent.
- **Where**: `ak5e/scripts/hookmaster-features.mjs` (L254–255, L595–604); `ak5e/scripts/specialist-uses.mjs`.
- **Why**: Bypasses mandatory rules requirements specified in Chapter 3 L5588–5598 while presenting facade state variables.
- **Suggestion**:
  1. Implement a plan/action for Bonus Action Hook Attack with the restriction that no other Ranged Hook attacks can be or have been made that turn.
  2. Implement the 10 ft pull on Ranged Hook attack hit against creatures <= +1 size larger (via `onAk5eEvent("hit")` or an attack card rider).
  3. Author unit tests covering both features in `hookmaster.test.mjs`.

#### [Critical] Finding 2: Broken Receipt Lifecycle ("Roll undefined" Cards) & Runtime Crash on `mightyPush` `useRoll`
- **What**: Pushing target entries with `kind: "move"` and `kind: "effect"` without `ready: true` permanently traps 6 plans (`bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, `scorpionSting`) in `"awaitingRoll"`, rendering a broken "Roll undefined" card button. On `mightyPush`, `useRoll` crashes with `TypeError: Cannot read properties of undefined (reading 'apply')` because `KINDS["damage"]` is undefined.
- **Where**: `ak5e/scripts/specialist-uses.mjs` (L863, L993, L1029, L1062, L1159, L1238, L1373).
- **Why**: Unhandled target kinds crash the operation kernel and corrupt chat card UI.
- **Suggestion**:
  1. Do not push unhandled `kind: "move"` or `kind: "damage"` to `receipt.targets` unless corresponding `targetKinds` are registered on `specialistUses` (as done in `medic-uses.mjs`).
  2. For abilities without dice rolls, ensure `receipt.status` resolves cleanly to `"complete"`.
  3. Add test cases exercising `useRoll` on `mightyPush` and verifying receipt status and card rendering across all plans.

#### [Major] Finding 3: Hook Lockout and Flight Attack Restrictions Not Enforced or Warned
- **What**: Attacks with the Hook are neither warned nor restricted when `isHookLocked(actor)` is true (Bound in Rope) or when `urbanJungle.active` is true (King of the Urban Jungle). Subsequent Hook features do not warn if the Hook is locked.
- **Where**: `ak5e/scripts/hookmaster-features.mjs:hookmasterPreRollAttack`; `ak5e/scripts/specialist-uses.mjs`.
- **Why**: Directly violates Ch. 3 L5622 (*"You cannot attack with your Hook"*) and L5640 (*"While you have a Creature Grappled in this way, you cannot use that Hook to make Attacks, or to use your Features"*).
- **Suggestion**: In `hookmasterPreRollAttack`, check `isHookLocked(actor)` and `urbanJungle.active` and set non-blocking warnings or card notices. In `specialist-uses.mjs`, add warnings if attempting Hook features while locked.

#### [Major] Finding 4: Race Condition Between Melee Hit and Big Boot Push Doubling
- **What**: `onAk5eEvent("hit")` immediately clears `urbanJungle.active` on a melee hit, causing subsequent activation of Big Boot to miss the doubled 20 ft push.
- **Where**: `ak5e/scripts/hookmaster-features.mjs` (L545–551); `ak5e/scripts/specialist-uses.mjs:bigBoot`.
- **Why**: Prevents the core synergy between King of the Urban Jungle and Big Boot from executing during table play.
- **Suggestion**: Retain an `immediateMeleeForcedMovementDoubled` flag or delay clearing `urbanJungle.active` until the end of the current action/turn.

#### [Major] Finding 5: Wrangler -5 Attack Penalty Lock & Inert DR Bypass
- **What**: The -5 attack penalty is configured once during the Wrangler latch plan rather than per attack, and `_ak5eWranglerIgnoreDR = true` is never checked by `damage-pipeline.mjs` or damage rolls, leaving DR in effect.
- **Where**: `ak5e/scripts/hookmaster-features.mjs` (L457–462); `ak5e/scripts/specialist-uses.mjs:wrangler`.
- **Why**: Players take a -5 attack penalty without receiving the rule-mandated DR bypass.
- **Suggestion**: Wire `ignoreDamageReduction = true` or `ignoreDR = true` to the damage options when the penalty is taken, and provide a per-attack toggle.

#### [Minor] Finding 6: Premature Flying Movement Prowess Trigger
- **What**: Activating King of the Urban Jungle immediately sets `flyingMovementThisTurn = flyingSpeed` (60/100 ft), unconditionally triggering +1 Prowess at turn end even if no movement occurred.
- **Where**: `ak5e/scripts/specialist-uses.mjs:kingOfUrbanJungle`.
- **Why**: Prowess should only be refunded if the character actually moves >45 ft via flying speed.

---

## 5. Adversarial Challenge Report

### Challenge Summary
**Overall risk assessment**: **HIGH**

### Challenges
1. **Challenge 1: Broken Target Relay & Chat Card Crash**
   - *Attack scenario*: A player activates Mighty Push against a targeted goblin and clicks the "Roll 8d6 Mighty Push Bludgeoning Damage" button on the chat card.
   - *Blast radius*: Runtime `TypeError: Cannot read properties of undefined (reading 'apply')`, leaving the transaction pending, displaying error notifications, and failing to apply damage.
   - *Mitigation*: Register valid `targetKinds` or omit target relay for unhandled kinds.
2. **Challenge 2: Facade BA Hook Attack & Missing 10 ft Pull**
   - *Attack scenario*: A player attempts to make a Bonus Action Hook Attack or pull an enemy 10 ft after hitting with a ranged Hook attack.
   - *Blast radius*: No controls or automated tracking exist; player is forced to manually calculate and improvise core 1st-level subclass mechanics.
   - *Mitigation*: Implement explicit plans and event triggers for both features.

### Stress Test Results
- `specialistUses.command(actor, "useRoll", { useId: pushOp })` with target actor -> **FAIL** (Throws `Cannot read properties of undefined (reading 'apply')`).
- `specialistUses.execute(actor, "bigBoot", { targetUuid })` receipt status -> **FAIL** (Receipt status trapped in `"awaitingRoll"` without roll formula).
- `onAk5eEvent("hit")` followed by `bigBoot` -> **FAIL** (`pushDistance` is 10 ft instead of 20 ft due to premature state clearance).
- `hookmasterPreRollAttack` with locked Hook (`hookLocked: true`) -> **FAIL** (Attacks permitted with no warning).

---

## 6. Verification Method

To independently verify these findings, run:
```bash
# 1. Reproduce the Mighty Push useRoll runtime crash:
node -e '
import { specialistUses } from "./ak5e/scripts/specialist-uses.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
import { defineSpecialistPools } from "./ak5e/scripts/specialist-features.mjs";
import { defineHookmasterPools, registerHookmasterHooks, HOOKMASTER_SUBCLASS_ID } from "./ak5e/scripts/hookmaster-features.mjs";
import { SPECIALIST_CLASS_ID } from "./ak5e/scripts/specialist-rules.mjs";

setupFoundryGlobals();
defineSpecialistPools();
defineHookmasterPools();
registerHookmasterHooks();

const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 11 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } });
const subClass = createTestItem({ name: "Hookmaster", type: "subclass", flags: { ak5e: { chapterThreeId: HOOKMASTER_SUBCLASS_ID } } });
const target = createTestActor({ name: "Goblin", uuid: "Actor.123", id: "123" });
globalThis.fromUuid = async (uuid) => uuid === target.uuid ? target : null;

const actor = createTestActor({
  name: "Hookmaster",
  items: [sClass, subClass],
  system: { traits: { size: "med" } },
  flags: { ak5e: { specialist: { enabled: true, branch: "hookmaster" }, resourcePools: { mightyPush: { value: 4, max: 4 } } } }
});

await specialistUses.execute(actor, "mightyPush", { targetUuid: target.uuid, targetName: target.name, distance: 5 }, "op-push");
await specialistUses.command(actor, "useRoll", { useId: "op-push" });
'

# 2. Reproduce the broken awaitingRoll status on bigBoot, boundInRope, etc.:
node -e '
import { specialistUses } from "./ak5e/scripts/specialist-uses.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
import { defineSpecialistPools } from "./ak5e/scripts/specialist-features.mjs";
import { defineHookmasterPools, registerHookmasterHooks, HOOKMASTER_SUBCLASS_ID } from "./ak5e/scripts/hookmaster-features.mjs";
import { SPECIALIST_CLASS_ID } from "./ak5e/scripts/specialist-rules.mjs";

setupFoundryGlobals();
defineSpecialistPools();
defineHookmasterPools();
registerHookmasterHooks();

const sClass = createTestItem({ name: "Specialist", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } });
const subClass = createTestItem({ name: "Hookmaster", type: "subclass", flags: { ak5e: { chapterThreeId: HOOKMASTER_SUBCLASS_ID } } });
const actor = createTestActor({
  name: "Hookmaster",
  items: [sClass, subClass],
  system: { traits: { size: "med" } },
  flags: { ak5e: { specialist: { enabled: true, branch: "hookmaster" }, hookmaster: {} } }
});

await specialistUses.execute(actor, "bigBoot", { targetUuid: "Actor.123", targetName: "Goblin" }, "op-boot");
const r = specialistUses.receipt(actor, "op-boot");
console.log("Status:", r.status); // Prints "awaitingRoll" instead of "complete"
'
```
