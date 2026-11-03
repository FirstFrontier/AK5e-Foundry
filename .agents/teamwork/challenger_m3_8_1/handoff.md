# Adversarial Challenge Report: Milestone 3 — Hookmaster Specialist Subclass

**Verdict:** **REQUEST_CHANGES**

---

## 1. Observation

### Test Execution Results
Authored and executed the comprehensive adversarial test suite in `ak5e/test/hookmaster-adversarial.test.mjs` covering all 10 assigned stress test areas:
Command: `node --test ak5e/test/hookmaster-adversarial.test.mjs`

```text
✔ Adversarial 1: Invalid Hooked Weapon Conversion & Cost Overrides (7.707838ms)
✔ Adversarial 2: Relative Creature Size Comparison Matrix Across All Sizes (1.762273ms)
✔ Adversarial 3: Resource Shortfall Overrides (Prowess = 0 Clamping) (4.17659ms)
✔ Adversarial 4: King of the Urban Jungle Pre-movement, Flying Speed Scaling & Attack Buffs (2.64598ms)
✔ Adversarial 5: Bound in Rope (Saves, Conditions, Hook Lockout, Drag, Hogtie, Release, Kill Event) (2.333142ms)
✔ Adversarial 6: Wrangler (Size Gate, Shared Space, Advantage, -5 DR Bypass, Release) (2.456137ms)
✖ Adversarial 7: Mighty Push (STR Save, Interactive 8d6 Roll, Knockback, Collision, useRoll Execution) (1.996229ms)
✔ Adversarial 8: Scorpion Sting (Pool Spend, Auto-fail, Lockout Bypass, Pull Direction, 6 Adv Attacks + Half Level Dmg) (1.151988ms)
✖ Adversarial 9: Full Undo Reversibility for Every Hookmaster Plan (2.782871ms)
✔ Adversarial 10: Hook Dispatch Integration via Hooks.callAll (0.522407ms)
✖ Adversarial 11: Receipt Lifecycle and Status Integrity (0.751965ms)
ℹ tests 11
ℹ suites 0
ℹ pass 8
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 175.017421
```

---

### Defect 1: Mighty Push Crashes on Roll Evaluation (`specialistUses.command(actor, "useRoll", { useId })`)
- **Observed File & Line:** `ak5e/scripts/specialist-uses.mjs:1238` and `ak5e/scripts/play-uses.mjs:185, 293, 369`
- **Verbatim Error Trace (`ak5e/test/hookmaster-adversarial.test.mjs:455`):**
  ```text
  AssertionError [ERR_ASSERTION]: Got unwanted rejection: Mighty Push useRoll MUST evaluate without crashing on unregistered target kind 'damage'
  Actual message: "Not applied yet: Cannot read properties of undefined (reading 'apply'). The use is recorded; retry it from the panel."
      at async TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/hookmaster-adversarial.test.mjs:455:3)
      at async finish (file:///home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs:297:15)
      at async useRoll (file:///home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs:369:20)
      at async specialistUses.command (file:///home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs:1484:10)
  ```
- **Code in `ak5e/scripts/specialist-uses.mjs`:**
  Line 1238:
  ```javascript
  receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "damage" });
  ```
- **Root Cause:** In `ak5e/scripts/play-uses.mjs`, `KINDS` only registers `heal`, `tempHP`, and `effect`. `specialistUses.register` does not register a custom `damage` target kind. When a player clicks the roll button on the chat card and `useRoll` executes, line 364 marks `entry.ready = true`, and line 293 in `finish()` attempts to apply target changes via `changeTarget(actor, receipt, entry, "apply")`. In `play-uses.mjs:185`, `applyTargetChange` calls `KINDS[entry.kind].apply(...)`. Because `KINDS["damage"]` is `undefined`, it crashes with `TypeError: Cannot read properties of undefined (reading 'apply')`, preventing the roll from being committed.

---

### Defect 2: Plans Without Dice Rolls (`bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, `scorpionSting`) Are Stuck in `"awaitingRoll"` Status
- **Observed File & Line:** `ak5e/scripts/specialist-uses.mjs:863, 993, 1029, 1062, 1159, 1373` and `ak5e/scripts/play-uses.mjs:300`
- **Verbatim Error Trace (`ak5e/test/hookmaster-adversarial.test.mjs:661`):**
  ```text
  AssertionError [ERR_ASSERTION]: bigBoot receipt status must be 'complete' since it requires no interactive dice roll
  + actual - expected
  + 'awaitingRoll'
  - 'complete'
      at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/hookmaster-adversarial.test.mjs:661:10)
  ```
- **Code in `ak5e/scripts/specialist-uses.mjs`:**
  - Line 863 (`bigBoot`): `receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "move" });`
  - Line 993 (`boundInRope`): `receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "effect" });`
  - Line 1029 (`dragBoundTarget`): `receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "move" });`
  - Line 1062 (`hogtie`): `receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "effect" });`
  - Line 1159 (`wrangler`): `receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "effect" });`
  - Line 1373 (`scorpionSting`): `receipt.targets.push({ uuid: targetUuid, name: targetName, kind: "effect" });`
- **Root Cause:** In `ak5e/scripts/play-uses.mjs:300`:
  ```javascript
  receipt.status = receipt.targets?.some(entry => !entry.ready) || (receipt.damageParts?.length && receipt.roll === undefined) || (receipt.formula && receipt.roll === undefined) ? "awaitingRoll" : "complete";
  ```
  Every target entry pushed without `ready: true` is considered incomplete by `play-uses.mjs`, causing it to set `receipt.status = "awaitingRoll"`. Because these abilities have no formula (`receipt.formula` is undefined), calling `useRoll` throws `need(receipt?.formula)`, permanently locking the receipt in `"awaitingRoll"`.
  (Note: Compare with Executor's `mortalBlow` or `transferDeathmark` in lines 340–370 & 500–525, which store `receipt.targetUuid = targetUuid` and `receipt.targetName = targetName` without pushing unconfigured target kind entries).

---

### Defect 3: Undoing `revertHookedWeapon` Fails to Restore Weapon Properties and Hook State on Item Document
- **Observed File & Line:** `ak5e/scripts/specialist-uses.mjs:1418–1444` (`hookmasterCleanup`)
- **Verbatim Error Trace (`ak5e/test/hookmaster-adversarial.test.mjs:534`):**
  ```text
  AssertionError [ERR_ASSERTION]: Undoing revertHookedWeapon MUST restore weapon's Hooked state and properties on Item document (WORKFLOW §3.2 reversibility)
  false !== true
      at TestContext.<anonymous> (file:///home/patch/AK5e-Foundry/ak5e/test/hookmaster-adversarial.test.mjs:534:10)
  ```
- **Code in `ak5e/scripts/specialist-uses.mjs`:**
  Lines 1418–1444:
  ```javascript
  export function hookmasterCleanup(state, receipt, actor) {
    if (receipt.command === "convertHookedWeapon") {
      const itemId = receipt.data?.itemId ?? receipt.result?.itemId;
      const item = actor.items?.get?.(itemId) ?? listItems(actor.items).find(i => i.id === itemId || i.uuid === itemId);
      if (item && receipt.originalItemState) {
        ...
      }
    }
  }
  ```
- **Root Cause:** `hookmasterCleanup` exclusively handles `convertHookedWeapon`. When `revertHookedWeapon` is executed, the item document is stripped of `two` and `thr`, its range reset to 5 ft, and its `isHooked` flags removed. When the player invokes `specialistUses.undo(actor, revertUseId)`, `actor.flags.ak5e.hookmaster.hookedWeaponId` is restored on the Actor, but the Item document itself is never updated back to a Hooked weapon. `isHookedWeapon(item)` remains `false`, and `item.system.properties` still lacks `two` and `thr`. This breaks encounter-window reversibility mandated by WORKFLOW §3.2.

---

### Passing Stress Dimensions (Verified Working)
1. **Invalid Weapon Conversion & Shortfall Overrides:** Rejection of non-weapons, Two-Handed weapons, ranged/ammunition weapons, and bludgeoning weapons; missing item handling; currency shortfall override clamps LMD at 0 (from 50 to 0) and records notice.
2. **Creature Size Comparison Engine:** Verified all 36 size pairings across `["tiny", "sm", "med", "lg", "huge", "grg"]`, confirming `isNoMoreThanOneSizeLarger` and `isMoreThanOneSizeLarger` are mutually exclusive and strictly conform to source thresholds.
3. **Prowess Shortfall Clamping:** Expending Prowess on Bound in Rope or Wrangler when Prowess is 0 with `overrides: ["shortfall"]` clamps the pool at 0 without negative values.
4. **King of the Urban Jungle:** Pre-movement warning under 20 ft with override; flying speed scales correctly (60 ft at Lv 5, 100 ft at Lv 15); immediate melee hit grants +PB bonus damage; Big Boot forced movement doubles to 20 ft; deactivates on melee hit.
5. **Bound in Rope Mechanics:** DEX save vs Martial DC, grappled state, hook locked, 15 ft drag, hogtie within 5 ft, release unlocks hook, and target kill event automatically unlocks hook.
6. **Wrangler Mechanics:** Enforces creature > +1 size, DEX save vs Martial DC, Advantage on attacks against latched target, optional -5 attack penalty for DR bypass.
7. **Scorpion Sting Mechanics:** 1/LR pool spend, automatic DEX save failure and lockout bypass if target is Grappled or Latched, pull target/actor to 5 ft depending on size, 6 advantaged attacks + half level (+10) bonus damage.
8. **Hook Handlers & Event Dispatch:** Tested via `Hooks.callAll("dnd5e.preRollAttackV2", ...)` and `Hooks.callAll("dnd5e.preRollDamageV2", ...)`. Verified STR mod substitution when STR > DEX for ranged hook attacks/damage without penalizing when DEX >= STR.

---

## 2. Logic Chain

1. **Defect 1 Chain:**
   - In `ak5e/scripts/specialist-uses.mjs:1238`, `mightyPush` pushes `{ uuid, name, kind: "damage" }` to `receipt.targets`.
   - In `ak5e/scripts/play-uses.mjs:185`, `applyTargetChange` routes through `KINDS[entry.kind].apply(...)`.
   - `KINDS` only defines `heal`, `tempHP`, and `effect`. No `damage` kind is registered.
   - When a user clicks the interactive roll button on the chat card, `useRoll` calls `finish()`, which calls `applyTargetChange` on `entry`.
   - Result: `KINDS["damage"]` is undefined $\rightarrow$ unhandled TypeError crashes roll application.

2. **Defect 2 Chain:**
   - In `ak5e/scripts/specialist-uses.mjs:863, 993, 1029, 1062, 1159, 1373`, target entries are pushed to `receipt.targets` without `ready: true`.
   - In `ak5e/scripts/play-uses.mjs:300`, `receipt.status` checks `receipt.targets?.some(entry => !entry.ready)`.
   - Since `entry.ready` is undefined (falsy), this condition evaluates to `true`.
   - Therefore, `receipt.status` is set to `"awaitingRoll"`.
   - But these abilities have no roll formula (`receipt.formula` is undefined), so `useRoll` cannot be called (`need(receipt?.formula)` rejects).
   - Result: Receipts for `bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, and `scorpionSting` are permanently stuck in `"awaitingRoll"` and can never reach `"complete"`.

3. **Defect 3 Chain:**
   - In `ak5e/scripts/specialist-uses.mjs:779–835`, `revertHookedWeapon` strips properties (`two`, `thr`) and flags (`flags.ak5e.isHooked = null`) from the weapon.
   - In `ak5e/scripts/specialist-uses.mjs:1418–1444`, `hookmasterCleanup` only contains logic for `if (receipt.command === "convertHookedWeapon")`.
   - When `specialistUses.undo(actor, revertUseId)` runs, `undoUse` in `play-uses.mjs` restores actor flags (`hookedWeaponId`), but relies on `hookmasterCleanup` for Item document mutations.
   - Because `revertHookedWeapon` is omitted from `hookmasterCleanup`, the Item document is never re-hooked.
   - Result: After undoing a revert, the actor's `hookedWeaponId` points to an unhooked weapon, `isHookedWeapon(item)` is `false`, and the item lacks Hook properties.

---

## 3. Caveats

- In-Foundry headless Playwright browser verification and screenshot inspection are reserved for Milestone 5 per the project milestone roadmap in `SCOPE.md`.
- Pure functional rules in `ak5e/scripts/hookmaster-features.mjs` (DC formulas, hook range calculations, size comparisons, attack/damage hook listeners) are solid and verified; the defects are strictly located in table-play receipt lifecycle, roll handling, and reversibility cleanup in `ak5e/scripts/specialist-uses.mjs`.

---

## 4. Conclusion

**Verdict:** **REQUEST_CHANGES**

The Hookmaster subclass rules calculations and event listeners are faithfully implemented, but 3 critical table-play defects were empirically discovered in `ak5e/scripts/specialist-uses.mjs` that prevent proper gameplay and violate WORKFLOW §3.2:
1. `mightyPush` crashes on roll execution due to unregistered target kind `"damage"`.
2. Plans without dice rolls are permanently stuck in `"awaitingRoll"` status due to target entries missing `ready: true` (or unneeded target pushes).
3. Undoing `revertHookedWeapon` fails to restore the weapon's hooked state and properties on the Item document.

### Required Actions for Worker:
1. **Fix `mightyPush` Target Handling in `ak5e/scripts/specialist-uses.mjs`:**
   - Do NOT push `{ uuid, name, kind: "damage" }` to `receipt.targets` unless a corresponding target kind is registered. Follow the pattern established by `mortalBlow` (`receipt.targetUuid = targetUuid`, `receipt.targetName = targetName`, `receipt.formula = "8d6"`).
2. **Fix Receipt Completion for Non-Roll Plans in `ak5e/scripts/specialist-uses.mjs`:**
   - In `bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, and `scorpionSting`, either set `ready: true` on target entries or align with the Executor target pattern (`receipt.targetUuid`, `receipt.targetName`) so that `receipt.status` cleanly finishes as `"complete"`.
3. **Implement `revertHookedWeapon` Undo in `hookmasterCleanup` (`ak5e/scripts/specialist-uses.mjs`):**
   - In `hookmasterCleanup`, add handling for `receipt.command === "revertHookedWeapon"` to re-apply `two` and `thr` properties, Hook range (30/50 ft), and `flags.ak5e.isHooked = true` to the weapon item.

---

## 5. Verification Method

To independently reproduce the failures and verify fixes:
```bash
# 1. Run the adversarial stress test suite (currently shows 8 passed, 3 failed reproducing the exact defects)
node --test ak5e/test/hookmaster-adversarial.test.mjs

# 2. Run the baseline Hookmaster test suite
node --test ak5e/test/hookmaster.test.mjs

# 3. Validate syntax across all modules
node ak5e/tools/validate-files.mjs
```

**Invalidation conditions:**
- Any of the 3 adversarial failures in `hookmaster-adversarial.test.mjs` remain unaddressed.
- Any regression in the 14 passing baseline tests in `hookmaster.test.mjs`.
- Any syntax or lint failure in `validate-files.mjs`.
